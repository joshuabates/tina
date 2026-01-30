# Tina Monitor Phase 2: Skill Integration

> **For Claude:** Use tina:executing-plans to implement this plan.

**Goal:** Phase executor uses CLI instead of status files. Update skills to pass team names explicitly and use `tina-monitor` for monitoring.

**Architecture:** Modifications to two skill files (`orchestrate/SKILL.md` and `team-lead-init/SKILL.md`) to:
1. Pass `phase_team_name` from orchestrator to phase executor
2. Have team-lead-init accept and use the provided team name
3. Remove file-based team name discovery (`team-name.txt`)
4. Document CLI-based monitoring as primary approach with file fallback

**Phase context:** Phase 1 completed the `tina-monitor` CLI tool with `status team` command that returns JSON with task summaries. This phase integrates that CLI into the orchestration workflow so phase executors can monitor phase completion without relying on status files.

---

### Task 1: Update orchestrate/SKILL.md to Pass phase_team_name to Executor

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Add phase team name derivation to executor spawn section**

Find the "Phase executor spawn" section in the orchestrate skill and update it to derive and pass the phase team name.

In the section that starts with `**Phase executor spawn:**`, add team name derivation before the JSON block:

```markdown
**Phase executor spawn:**

When: plan-phase-N complete
Prerequisites: Need worktree_path (from setup-worktree metadata), plan_path (from plan-phase-N metadata)

Derive phase team name:
```
PHASE_TEAM_NAME="${FEATURE_NAME}-phase-${N}"
```
```

**Step 2: Update the executor spawn JSON to include phase_team_name**

Update the executor spawn JSON block to include the new parameter:

```json
{
  "subagent_type": "tina:phase-executor",
  "team_name": "<TEAM_NAME>",
  "name": "executor-N",
  "prompt": "phase_num: N\nworktree_path: <WORKTREE_PATH>\nplan_path: <PLAN_PATH>\nfeature_name: <FEATURE_NAME>\nphase_team_name: <PHASE_TEAM_NAME>\n\nStart team-lead in tmux and monitor until phase completes.\nReport: execute-N complete. Git range: <BASE>..<HEAD>"
}
```

**Step 3: Add metadata storage for phase team name**

After the executor spawn JSON, add:

```markdown
Store phase team name in task metadata:
```json
TaskUpdate {
  "taskId": "execute-phase-N",
  "metadata": {
    "phase_team_name": "<PHASE_TEAM_NAME>"
  }
}
```
```

**Step 4: Commit the changes**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "feat(orchestrate): pass phase_team_name to executor for CLI monitoring"
```

---

### Task 2: Add Task Metadata Convention Section to orchestrate/SKILL.md

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Add Task Metadata Convention section**

Add a new section after the "Spawning Teammates" section (or in Implementation Details) documenting the metadata convention:

```markdown
### Task Metadata Convention

Orchestration tasks store metadata for monitoring and recovery:

| Task | Required Metadata |
|------|-------------------|
| `validate-design` | `validation_status: "pass"\|"warning"\|"stop"` |
| `setup-worktree` | `worktree_path`, `branch_name` |
| `plan-phase-N` | `plan_path` |
| `execute-phase-N` | `phase_team_name`, `started_at` |
| `execute-phase-N` (on complete) | `git_range`, `completed_at` |
| `review-phase-N` | `status: "pass"\|"gaps"`, `issues[]` (if gaps) |

The `phase_team_name` field links the orchestrator's task to the phase execution team. This enables:
- TUI to show nested task progress
- CLI to query phase status
- Recovery to find the right team
```

**Step 2: Commit the changes**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add task metadata convention for monitoring"
```

---

### Task 3: Add Phase Executor Monitoring Section to orchestrate/SKILL.md

**Files:**
- Modify: `skills/orchestrate/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Add Phase Executor Monitoring section**

Add a new section documenting how phase executors should monitor using the CLI:

```markdown
### Phase Executor Monitoring

The phase executor monitors the phase execution team using `tina-monitor` CLI:

```bash
PHASE_TEAM_NAME="$1"  # from prompt

# Wait for team to be created
while ! tina-monitor status team "$PHASE_TEAM_NAME" --format=json &>/dev/null; do
  sleep 2
done

# Monitor until complete or blocked
while true; do
  STATUS=$(tina-monitor status team "$PHASE_TEAM_NAME" --format=json)
  TEAM_STATUS=$(echo "$STATUS" | jq -r '.status')

  case "$TEAM_STATUS" in
    complete)
      GIT_RANGE=$(echo "$STATUS" | jq -r '.metadata.git_range // empty')
      # Report completion to orchestrator
      break
      ;;
    blocked)
      REASON=$(echo "$STATUS" | jq -r '.blocked_reason')
      # Report blocked status to orchestrator
      break
      ;;
    *)
      sleep 10
      ;;
  esac
done
```

**Fallback:** If `tina-monitor` is not installed, fall back to reading `.claude/tina/phase-N/status.json` directly:

```bash
STATUS_FILE="${WORKTREE_PATH}/.claude/tina/phase-${PHASE_NUM}/status.json"
if [ -f "$STATUS_FILE" ]; then
  PHASE_STATUS=$(jq -r '.status' "$STATUS_FILE")
fi
```
```

**Step 2: Commit the changes**

```bash
git add skills/orchestrate/SKILL.md
git commit -m "docs(orchestrate): add CLI-based phase executor monitoring"
```

---

### Task 4: Update team-lead-init/SKILL.md to Accept Team Name from Invocation

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Update STEP 1 to extract team_name from invocation**

Update the STEP 1 section to also extract the team name from the invocation prompt:

```markdown
## STEP 1: Extract phase number and team name from invocation

The invocation prompt contains:
- `team_name`: The team name to use (provided by executor)
- `plan_path`: Path to the phase plan

Example prompt:
```
team_name: auth-feature-phase-1
plan_path: docs/plans/2026-01-30-auth-feature-phase-1.md
```

Extract phase number from plan path:
Pattern: `-phase-(\d+(?:\.\d+)?)\.md$`
Example: `docs/plans/2026-01-26-feature-phase-1.md` -> PHASE_NUM = 1
Example: `docs/plans/2026-01-26-feature-phase-1.5.md` -> PHASE_NUM = 1.5
```

**Step 2: Update STEP 3 to use provided team name**

Update the STEP 3 section to use the team name from invocation:

```markdown
## STEP 3: CALL Teammate tool NOW to create team

```json
{
  "operation": "spawnTeam",
  "team_name": "<team_name from invocation>",
  "description": "Phase <N> execution team"
}
```

**IMPORTANT:** Use the team_name provided in the invocation. Do NOT generate your own name.
```

**Step 3: Commit the changes**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "feat(team-lead-init): accept team_name from invocation prompt"
```

---

### Task 5: Remove team-name.txt File Creation from team-lead-init/SKILL.md

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Remove STEP 3b that writes team-name.txt**

Find and remove the STEP 3b section that writes the team name to a file:

Replace:
```markdown
## STEP 3b: Write team name to file for executor discovery

After team creation succeeds, write the team name to a file that the phase executor can discover:

```bash
TEAM_NAME="phase-$PHASE_NUM-execution"
TEAM_NAME_FILE=".claude/tina/phase-$PHASE_NUM/team-name.txt"
echo "$TEAM_NAME" > "$TEAM_NAME_FILE"
```

This enables the phase executor (from the orchestrator's team) to monitor the team-lead's task progress.
```

With:
```markdown
## STEP 3b: REMOVED

Team name file is no longer needed. The executor already knows the team name since it provided it in the invocation.
```

**Step 2: Also remove the reference in the "Write team name for executor discovery" section**

Find and update or remove any other references to writing team-name.txt in the skill file.

**Step 3: Commit the changes**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "refactor(team-lead-init): remove team-name.txt file creation"
```

---

### Task 6: Update Team Spawning Section in team-lead-init/SKILL.md

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Update the Team Spawning section**

Find the "Team Spawning (Ephemeral Model)" section and update the phase initialization part:

Replace the team_name line:
```markdown
- team_name: "phase-N-execution" (replace N with actual phase number)
```

With:
```markdown
- team_name: "<team_name from invocation>" (use exactly what was provided)
```

**Step 2: Remove the "Write team name for executor discovery" subsection**

Find and remove or update the subsection that mentions writing team-name.txt:

Replace:
```markdown
**Write team name for executor discovery:**

After team creation, write the team name to a discoverable file:

```bash
mkdir -p ".claude/tina/phase-$PHASE_NUM"
echo "phase-$PHASE_NUM-execution" > ".claude/tina/phase-$PHASE_NUM/team-name.txt"
```

This file is read by the phase executor to know which team's tasks to monitor.
```

With:
```markdown
**Team name coordination:**

The team name is provided by the phase executor in the invocation prompt. The executor spawns team-lead-init with a specific team name, then monitors that team using `tina-monitor status team <name>`.

No file-based discovery is needed - the executor knows the team name because it defined it.
```

**Step 3: Commit the changes**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "refactor(team-lead-init): update team spawning to use provided team name"
```

---

### Task 7: Update State Files Documentation in team-lead-init/SKILL.md

**Files:**
- Modify: `skills/team-lead-init/SKILL.md`

**Model:** sonnet

**review:** spec-only

**Step 1: Update the Integration section's State files list**

Find the "State files:" list in the Integration section and update it:

Replace:
```markdown
**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status
- `.claude/tina/phase-N/team-name.txt` - Team name for executor discovery
```

With:
```markdown
**State files:**
- `.claude/tina/phase-N/status.json` - Phase execution status (fallback for monitoring)

Note: `team-name.txt` is no longer used. Team names are passed explicitly from orchestrator to executor to team-lead.
```

**Step 2: Commit the changes**

```bash
git add skills/team-lead-init/SKILL.md
git commit -m "docs(team-lead-init): update state files documentation"
```

---

### Task 8: Update phase-executor Agent Definition (if exists)

**Files:**
- Check for: `agents/phase-executor/AGENT.md` or similar

**Model:** haiku

**review:** none

**Step 1: Check if phase-executor agent definition exists**

Look for a phase-executor agent definition file. If it exists, update it to:
1. Accept `phase_team_name` in the prompt
2. Use `tina-monitor` for monitoring
3. Fall back to status.json if CLI not available

If no agent definition exists, skip this task.

**Step 2: Commit any changes**

```bash
git add agents/
git commit -m "feat(phase-executor): update to use CLI monitoring with phase_team_name"
```

---

### Task 9: Final Verification and Testing

**Files:**
- Read: `skills/orchestrate/SKILL.md`
- Read: `skills/team-lead-init/SKILL.md`

**Model:** haiku

**review:** none

**Step 1: Verify orchestrate skill changes**

Read the orchestrate skill and verify:
1. Phase executor spawn includes `phase_team_name` in prompt
2. Task metadata convention section exists
3. Phase executor monitoring section documents CLI usage

**Step 2: Verify team-lead-init skill changes**

Read the team-lead-init skill and verify:
1. STEP 1 extracts team_name from invocation
2. STEP 3 uses provided team name
3. STEP 3b removed or marked as removed
4. No references to writing team-name.txt remain
5. State files documentation updated

**Step 3: Search for any remaining team-name.txt references**

```bash
grep -r "team-name.txt" skills/
```

Should return no active references (only the "REMOVED" note).

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat(skills): complete CLI-based monitoring integration for phase execution"
```

---

## Phase Estimates

| Metric | Expected | Measurement Command |
|--------|----------|---------------------|
| Files modified | 2 | `git diff --name-only HEAD~9..HEAD \| wc -l` |
| Lines changed | ~100 | `git diff --stat HEAD~9..HEAD \| tail -1` |
| New sections added | 3 | Manual count |
| Sections removed | 1 | Manual count |

**Target files:**
- `skills/orchestrate/SKILL.md` - Add phase_team_name, metadata convention, CLI monitoring docs
- `skills/team-lead-init/SKILL.md` - Accept team_name, remove file-based discovery

**ROI expectation:** Phase 2 enables reliable CLI-based monitoring of phase execution, eliminating race conditions with file-based discovery. The orchestrator now has explicit control over team naming, making the system more predictable and debuggable.

---

## Success Criteria

1. `orchestrate/SKILL.md` passes `phase_team_name` to executor in spawn prompt
2. `orchestrate/SKILL.md` documents CLI-based monitoring with fallback
3. `team-lead-init/SKILL.md` accepts `team_name` from invocation
4. `team-lead-init/SKILL.md` no longer writes `team-name.txt`
5. No grep matches for active `team-name.txt` usage in skills/

---

## Dependencies

- Phase 1: Core Data Model & CLI must be complete (provides `tina-monitor status team` command)

## Blocked By

- Phase 1 completion

## Enables

- Phase 3: TUI can show orchestration hierarchy using phase_team_name metadata
- Reliable phase execution monitoring without file-based race conditions
