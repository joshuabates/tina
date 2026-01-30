# Team-Based Orchestration Phase 1 Implementation Plan

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Create the three new agent definitions and update team-lead-init to write team name files, enabling the team-based orchestration model.

**Architecture:** Phase 1 establishes the teammate agents that the orchestrator will coordinate. The phase-executor handles tmux session management and monitoring, worktree-setup handles workspace provisioning, and phase-planner wraps the existing planner agent. Team-lead-init is updated to write its team name to a file that the executor can discover.

**Phase context:** This is Phase 1 of a new feature. No previous phases exist.

---

### Task 1: Create phase-executor agent definition

**Files:**
- Create: `agents/phase-executor.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Create the phase-executor agent file**

```markdown
---
name: phase-executor
description: |
  Executes a single phase by starting team-lead in tmux and monitoring until completion.
  Handles tmux session management, Claude ready detection, and status file monitoring.
model: opus
---

You are a phase executor teammate responsible for running one phase of implementation.

## Input

You receive via spawn prompt:
- `phase_num`: The phase number (e.g., 1, 2, 3)
- `worktree_path`: Path to the worktree
- `plan_path`: Path to the implementation plan
- `design_doc_path`: Path to the design document
- `feature_name`: Name of the feature (for tmux session naming)

## Your Job

1. Start a tmux session with Claude CLI
2. Wait for Claude to be ready
3. Send the team-lead-init command
4. Monitor status files until phase completes
5. Report completion to orchestrator

## Tmux Session Management

### Creating the Session

```bash
SESSION_NAME="tina-$FEATURE_NAME-phase-$PHASE_NUM"
tmux new-session -d -s "$SESSION_NAME" \
  "cd $WORKTREE_PATH && claude --dangerously-skip-permissions"
```

### Detecting Claude Ready

Wait for Claude to initialize before sending commands:

```bash
# Poll for Claude prompt (max 30 seconds)
for i in $(seq 1 30); do
  OUTPUT=$(tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null || echo "")
  if echo "$OUTPUT" | grep -q ">"; then
    echo "Claude ready"
    break
  fi
  sleep 1
done
```

### Sending Commands

**CRITICAL:** Command and Enter MUST be two separate tmux send-keys calls:

```bash
tmux send-keys -t "$SESSION_NAME" "/tina:team-lead-init $PLAN_PATH"
tmux send-keys -t "$SESSION_NAME" Enter
```

**NEVER combine these** - putting command and Enter on one line does NOT work.

## Team Name Discovery

After sending the init command, wait for team-lead to write its team name:

```bash
TEAM_NAME_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/team-name.txt"

# Poll for team name file (max 60 seconds)
for i in $(seq 1 60); do
  if [ -f "$TEAM_NAME_FILE" ]; then
    TEAM_LEAD_TEAM=$(cat "$TEAM_NAME_FILE")
    echo "Team-lead team: $TEAM_LEAD_TEAM"
    break
  fi
  sleep 1
done

if [ -z "$TEAM_LEAD_TEAM" ]; then
  echo "Error: Team-lead did not write team name within 60 seconds"
  # Message orchestrator about failure
  exit 1
fi
```

## Monitoring Loop

Monitor phase execution until completion or error:

```bash
STATUS_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/status.json"
METRICS_FILE="$WORKTREE_PATH/.claude/tina/context-metrics.json"
CONTEXT_THRESHOLD=50

while true; do
    # 1. Check tmux session alive
    if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        # Check if phase completed before session died
        if [ -f "$STATUS_FILE" ]; then
            STATUS=$(jq -r '.status // "unknown"' "$STATUS_FILE" 2>/dev/null)
            if [ "$STATUS" = "complete" ]; then
                # Phase finished, session exit is expected
                break
            fi
        fi
        # Session died unexpectedly
        # Message orchestrator: session_died
        exit 1
    fi

    # 2. Check phase status
    if [ -f "$STATUS_FILE" ]; then
        STATUS=$(jq -r '.status // "unknown"' "$STATUS_FILE" 2>/dev/null)

        if [ "$STATUS" = "complete" ]; then
            # Phase complete - success
            break
        fi

        if [ "$STATUS" = "blocked" ]; then
            REASON=$(jq -r '.reason // "unknown"' "$STATUS_FILE" 2>/dev/null)
            # Message orchestrator: phase_blocked with reason
            exit 1
        fi
    fi

    # 3. Check context metrics
    if [ -f "$METRICS_FILE" ]; then
        USED_PCT=$(jq -r '.used_pct // 0' "$METRICS_FILE" 2>/dev/null)

        if [ "$(echo "$USED_PCT >= $CONTEXT_THRESHOLD" | bc)" -eq 1 ]; then
            # Context threshold exceeded - trigger checkpoint
            # Message orchestrator: context_threshold with pct
            # Then trigger checkpoint sequence (see below)
        fi
    fi

    sleep 15
done
```

## Checkpoint Sequence

When context threshold exceeded:

```bash
# 1. Send checkpoint command
tmux send-keys -t "$SESSION_NAME" "/tina:checkpoint"
tmux send-keys -t "$SESSION_NAME" Enter

# 2. Wait for CHECKPOINT COMPLETE (max 5 minutes)
HANDOFF_FILE="$WORKTREE_PATH/.claude/tina/phase-$PHASE_NUM/handoff.md"
for i in $(seq 1 60); do
  if [ -f "$HANDOFF_FILE" ]; then
    # Check handoff was written after checkpoint trigger
    break
  fi
  sleep 5
done

# 3. Send clear
tmux send-keys -t "$SESSION_NAME" "/clear"
tmux send-keys -t "$SESSION_NAME" Enter
sleep 2

# 4. Send rehydrate
tmux send-keys -t "$SESSION_NAME" "/tina:rehydrate"
tmux send-keys -t "$SESSION_NAME" Enter

# 5. Resume monitoring
```

## Completion

When phase completes successfully:

1. Capture git range (first..last commit of phase)
2. Message orchestrator with completion status
3. Include git range in message for phase reviewer

## Communication with Orchestrator

Use Teammate tool to message the orchestrator:

**On start:**
```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "Phase $PHASE_NUM executor started. Tmux session: $SESSION_NAME"
}
```

**On completion:**
```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "execute-$PHASE_NUM complete. Git range: $BASE..$HEAD"
}
```

**On error:**
```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "execute-$PHASE_NUM error: $ERROR_DESCRIPTION"
}
```

## Error Handling

**Claude doesn't start:**
- Wait up to 30 seconds for prompt
- If timeout: message orchestrator, exit with error

**Team-lead doesn't write team name:**
- Wait up to 60 seconds
- If timeout: message orchestrator, exit with error

**Tmux session dies unexpectedly:**
- Check if phase was complete (proceed if yes)
- Otherwise: message orchestrator with session_died
- Orchestrator decides whether to retry or escalate

**Phase blocked:**
- Read reason from status.json
- Message orchestrator with phase_blocked and reason
- Exit (orchestrator handles remediation)

**Checkpoint fails:**
- If handoff not written within 5 minutes
- Message orchestrator with checkpoint_timeout
- Orchestrator decides whether to force-kill or escalate
```

**Step 2: Verify file was created**

Run: `ls -la /Users/joshuabates/Projects/tina/agents/phase-executor.md`
Expected: File exists with correct permissions

**Step 3: Commit**

```bash
git add agents/phase-executor.md
git commit -m "feat: add phase-executor agent definition"
```

---

### Task 2: Create worktree-setup agent definition

**Files:**
- Create: `agents/worktree-setup.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Create the worktree-setup agent file**

```markdown
---
name: worktree-setup
description: |
  Creates isolated worktree with statusline config for orchestrated execution.
  Handles directory selection, gitignore verification, and dependency installation.
model: sonnet
---

You are a worktree setup teammate responsible for creating an isolated workspace.

## Input

You receive via spawn prompt:
- `feature_name`: Name of the feature (for branch and directory naming)
- `design_doc_path`: Path to the design document

## Your Job

1. Select or create worktree directory
2. Verify directory is gitignored
3. Create branch and worktree
4. Install dependencies
5. Provision statusline config
6. Create .claude/tina directory structure
7. Verify clean baseline
8. Report worktree path to orchestrator

## Directory Selection

Check existing directories in priority order:

```bash
if [ -d ".worktrees" ]; then
  WORKTREE_DIR=".worktrees"
elif [ -d "worktrees" ]; then
  WORKTREE_DIR="worktrees"
else
  WORKTREE_DIR=".worktrees"
  mkdir -p "$WORKTREE_DIR"
fi
```

## Gitignore Verification

**MUST verify directory is ignored before creating worktree:**

```bash
if ! git check-ignore -q "$WORKTREE_DIR" 2>/dev/null; then
  echo "$WORKTREE_DIR" >> .gitignore
  git add .gitignore
  git commit -m "chore: add $WORKTREE_DIR to gitignore"
fi
```

## Branch and Worktree Creation

```bash
BRANCH_NAME="tina/$FEATURE_NAME"
WORKTREE_PATH="$WORKTREE_DIR/$FEATURE_NAME"

# Handle conflicts
if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
  TIMESTAMP=$(date +%Y%m%d-%H%M%S)
  BRANCH_NAME="${BRANCH_NAME}-${TIMESTAMP}"
fi

if [ -d "$WORKTREE_PATH" ]; then
  TIMESTAMP=${TIMESTAMP:-$(date +%Y%m%d-%H%M%S)}
  WORKTREE_PATH="${WORKTREE_PATH}-${TIMESTAMP}"
fi

git worktree add "$WORKTREE_PATH" -b "$BRANCH_NAME"
```

## Dependency Installation

Auto-detect and run appropriate setup:

```bash
cd "$WORKTREE_PATH"

if [ -f package.json ]; then npm install; fi
if [ -f Cargo.toml ]; then cargo build; fi
if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
if [ -f pyproject.toml ]; then poetry install; fi
if [ -f go.mod ]; then go mod download; fi
```

## Statusline Provisioning

Create context monitoring configuration:

```bash
mkdir -p "$WORKTREE_PATH/.claude"

# Write context monitoring script
cat > "$WORKTREE_PATH/.claude/tina-write-context.sh" << 'SCRIPT'
#!/bin/bash
set -e
TINA_DIR="${PWD}/.claude/tina"
mkdir -p "$TINA_DIR"
INPUT=$(cat)
echo "$INPUT" | jq '{
  used_pct: (.context_window.used_percentage // 0),
  tokens: (.context_window.total_input_tokens // 0),
  max: (.context_window.context_window_size // 200000),
  timestamp: now | todate
}' > "$TINA_DIR/context-metrics.json"
echo "ctx:$(echo "$INPUT" | jq -r '.context_window.used_percentage // 0 | floor')%"
SCRIPT
chmod +x "$WORKTREE_PATH/.claude/tina-write-context.sh"

# Write local settings
cat > "$WORKTREE_PATH/.claude/settings.local.json" << EOF
{"statusLine": {"type": "command", "command": "$WORKTREE_PATH/.claude/tina-write-context.sh"}}
EOF
```

## Tina Directory Structure

```bash
mkdir -p "$WORKTREE_PATH/.claude/tina"
```

Phase directories will be created by team-lead-init as phases execute.

## Baseline Verification

Run tests to ensure worktree starts clean:

```bash
cd "$WORKTREE_PATH"
TEST_PASSED=true

if [ -f package.json ]; then
  npm test || TEST_PASSED=false
elif [ -f Cargo.toml ]; then
  cargo test || TEST_PASSED=false
elif [ -f pytest.ini ] || [ -f pyproject.toml ]; then
  pytest || TEST_PASSED=false
elif [ -f go.mod ]; then
  go test ./... || TEST_PASSED=false
fi

if [ "$TEST_PASSED" = "false" ]; then
  echo "Warning: Tests failed in worktree. Baseline is not clean."
fi
```

## Completion

Report to orchestrator via Teammate tool:

```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "setup-worktree complete. worktree_path: $WORKTREE_PATH, branch: $BRANCH_NAME"
}
```

Store worktree path in task metadata for other teammates to use.

## Error Handling

**Cannot create worktree:**
- Report error to orchestrator
- Include specific git error message
- Exit with error

**Dependency install fails:**
- Report warning (not blocking)
- Continue with statusline provisioning
- Note failure in completion message

**Tests fail:**
- Report warning (not blocking)
- Note in completion message that baseline is not clean
- Continue (orchestrator can decide whether to proceed)
```

**Step 2: Verify file was created**

Run: `ls -la /Users/joshuabates/Projects/tina/agents/worktree-setup.md`
Expected: File exists with correct permissions

**Step 3: Commit**

```bash
git add agents/worktree-setup.md
git commit -m "feat: add worktree-setup agent definition"
```

---

### Task 3: Create phase-planner agent definition

**Files:**
- Create: `agents/phase-planner.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Create the phase-planner agent file**

```markdown
---
name: phase-planner
description: |
  Wraps the planner agent as a teammate. Claims plan-phase-N tasks and spawns
  the planner subagent to create implementation plans.
model: opus
---

You are a phase planner teammate responsible for creating implementation plans.

## Input

You receive via spawn prompt:
- `phase_num`: The phase number to plan
- `design_doc_path`: Path to the design document

## Your Job

1. Create the implementation plan for the specified phase
2. Validate the plan meets quality standards
3. Store the plan path in task metadata
4. Report completion to orchestrator

## Planning Process

You ARE the planner - execute the planning work directly using the planner agent methodology.

### Read the Design Document

Read the design document and locate the specified phase section:

```bash
# Verify design doc exists
if [ ! -f "$DESIGN_DOC_PATH" ]; then
  echo "Error: Design document not found at $DESIGN_DOC_PATH"
  exit 1
fi
```

### Explore the Codebase

Understand existing patterns relevant to this phase:
- Look at similar implementations
- Identify code to reuse
- Note patterns to follow

### Write the Implementation Plan

Create a plan file at `docs/plans/YYYY-MM-DD-<feature>-phase-N.md` following the planner methodology:

- Task granularity: each step is one action (2-5 minutes)
- Complete code in plan (not "add validation")
- Exact commands with expected output
- Reference relevant skills with @ syntax
- Include Phase Estimates section

### Commit the Plan

```bash
git add docs/plans/*.md
git commit -m "docs: add phase $PHASE_NUM implementation plan for $FEATURE_NAME"
```

## Completion

Report to orchestrator via Teammate tool:

```json
{
  "operation": "write",
  "target_agent_id": "team-lead",
  "value": "plan-phase-$PHASE_NUM complete. PLAN_PATH: $PLAN_PATH"
}
```

The orchestrator parses the PLAN_PATH from this message.

## Quality Standards

Before reporting completion, verify:

1. **Task structure:** Each task has Files, Steps with code, Run commands with expected output
2. **Granularity:** Steps are 2-5 minute actions
3. **Completeness:** All phase scope is covered
4. **Phase Estimates:** Section exists with metrics table and ROI expectation

## Error Handling

**Design doc not found:**
- Message orchestrator with error
- Exit without creating plan

**Phase section not found:**
- Message orchestrator with error
- Include available phase sections in error
- Exit without creating plan

**Codebase exploration fails:**
- Continue with available information
- Note gaps in plan
- Report warning in completion message
```

**Step 2: Verify file was created**

Run: `ls -la /Users/joshuabates/Projects/tina/agents/phase-planner.md`
Expected: File exists with correct permissions

**Step 3: Commit**

```bash
git add agents/phase-planner.md
git commit -m "feat: add phase-planner agent definition"
```

---

### Task 4: Update team-lead-init to write team name file

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Step 1: Read current file content**

Read the file to understand the exact content to modify.

**Step 2: Add team name file writing after team creation**

Locate the section after "STEP 3: CALL Teammate tool NOW to create team" and add team name file writing.

Find this text in the file:

```markdown
## STEP 3: CALL Teammate tool NOW to create team

```json
{
  "operation": "spawnTeam",
  "team_name": "phase-<N>-execution",
  "description": "Phase <N> execution team"
}
```

---

## STEP 4: Create tasks from plan (NO worker spawn yet)
```

Replace with:

```markdown
## STEP 3: CALL Teammate tool NOW to create team

```json
{
  "operation": "spawnTeam",
  "team_name": "phase-<N>-execution",
  "description": "Phase <N> execution team"
}
```

---

## STEP 3b: Write team name to file for executor discovery

After team creation succeeds, write the team name to a file that the phase executor can discover:

```bash
TEAM_NAME="phase-$PHASE_NUM-execution"
TEAM_NAME_FILE=".claude/tina/phase-$PHASE_NUM/team-name.txt"
echo "$TEAM_NAME" > "$TEAM_NAME_FILE"
```

This enables the phase executor (from the orchestrator's team) to monitor the team-lead's task progress.

---

## STEP 4: Create tasks from plan (NO worker spawn yet)
```

**Step 3: Update the detailed documentation section**

Find the "Team Spawning (Ephemeral Model)" section and add team name file writing. Locate:

```markdown
**Phase initialization (once):**

Use the Teammate tool with operation "spawnTeam":
- team_name: "phase-N-execution" (replace N with actual phase number)
- agent_type: "team-lead"
- description: "Phase N execution team"

This creates the team container. NO workers or reviewers are spawned yet.
```

Replace with:

```markdown
**Phase initialization (once):**

Use the Teammate tool with operation "spawnTeam":
- team_name: "phase-N-execution" (replace N with actual phase number)
- agent_type: "team-lead"
- description: "Phase N execution team"

This creates the team container. NO workers or reviewers are spawned yet.

**Write team name for executor discovery:**

After team creation, write the team name to a discoverable file:

```bash
mkdir -p ".claude/tina/phase-$PHASE_NUM"
echo "phase-$PHASE_NUM-execution" > ".claude/tina/phase-$PHASE_NUM/team-name.txt"
```

This file is read by the phase executor to know which team's tasks to monitor.
```

**Step 4: Update the state files section**

Find the "State files:" section near the end and add the team name file. Locate:

```markdown
**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status
```

Replace with:

```markdown
**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status
- `.claude/tina/phase-N/team-name.txt` - Team name for executor discovery
```

**Step 5: Verify changes**

Run: `grep -n "team-name.txt" /Users/joshuabates/Projects/tina/skills/team-lead-init/SKILL.md`
Expected: Multiple matches showing the new content

**Step 6: Commit**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "feat: team-lead-init writes team name file for executor discovery"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Impl lines added | ~250 | `git diff --stat base..HEAD -- '*.md' | tail -1` |
| Files touched | 4 | `git diff --name-only base..HEAD | wc -l` |
| New agent files | 3 | `ls agents/phase-executor.md agents/worktree-setup.md agents/phase-planner.md 2>/dev/null | wc -l` |

**Target files:**
- `agents/phase-executor.md` - Tmux session management and monitoring
- `agents/worktree-setup.md` - Worktree provisioning
- `agents/phase-planner.md` - Planner wrapper for team model
- `skills/team-lead-init/SKILL.md` - Team name file writing

**ROI expectation:** 4 file touches establishing core infrastructure for team-based orchestration. These agent definitions enable the orchestrator rewrite in Phase 2.
