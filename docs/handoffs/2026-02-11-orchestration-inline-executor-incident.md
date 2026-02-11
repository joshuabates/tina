# Orchestration Incident Handoff: Inline Executor Instead of Tina Phase Run

Date: 2026-02-11  
Owner: Tina orchestration team  
Status: Deep-dive evidence + root-cause hypothesis

## 1) Incident summary

During orchestration, phase execution is occurring inline inside the spawned teammate session instead of starting Tina phase execution (`tina-session start` -> phase team in tmux). The observed symptom is an executor behaving like a generic coding agent rather than Tina `phase-executor` behavior.

This breaks the expected runtime contract in `/Users/joshua/Projects/tina/docs/architecture/orchestration-architecture.md:24`, where `tina:phase-executor` is defined as:
- `Start tmux phase run + wait for terminal phase status`

## 2) Expected behavior vs observed behavior

Expected:
- `tina:phase-executor` starts a phase run and reports lifecycle messages (`execute-N started`, `execute-N complete`).

Observed:
- Executor runs as generic inline implementation behavior.
- The spawned teammate does not follow Tina executor workflow semantics.

## 3) Primary evidence from failing orchestration (latest)

### 3.1 Team config shows in-process executor teammate for the failing run

File: `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json`

Key fields:
- `leadSessionId`: `f529838e-b7d0-463e-b2fc-a1edcd59cfa5`
- `agentType`: `tina:phase-executor`
- `tmuxPaneId`: `in-process`
- `backendType`: `in-process`

Reference lines (from local grep):
- `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json:6`
- `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json:21`
- `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json:27`
- `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json:30`

### 3.2 Lead debug log shows Tina agents available, but spawn-time resolution failing

File: `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt`

Evidence that Tina agents were loaded:
- `Loaded 22 agents from plugin tina default directory`
- Reference: `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:46`

Evidence of spawn-time failure for Tina agent types:
- `[handleSpawnInProcess] agent_type=tina:design-validator, found=false`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:4307`
- `[handleSpawnInProcess] agent_type=tina:plan-validator, found=false`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:6104`
- `[handleSpawnInProcess] agent_type=tina:phase-executor, found=false`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:8310`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:24489`

Evidence of fallback prompt path:
- `[SystemPrompt] path=simple`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:8315`
  - `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt:24494`

This shows the teammate is created, but not with resolved Tina agent behavior.

### 3.3 Backend selection in the failing run

File: `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt`

- `TeammateModeSnapshot` is `auto` (`:17`)
- Backend gate resolves to in-process:  
  - `[BackendRegistry] isInProcessEnabled: true (mode=auto, insideTmux=false)` (`:168`, repeated)

This indicates the run is on the in-process teammate path (not tmux teammate panes).

### 3.4 Direct symptom in teammate messages

File: `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/inboxes/team-lead.json`

- Executor reports completing work in main tree:
  - `"The files may appear missing ... These changes are in the main working tree at /Users/joshua/Projects/tina/."`
- This matches the incident symptom (inline coding in main tree instead of phase-run workflow).

## 4) Repeated pattern in prior orchestration run

Another orchestration shows the same failure signature repeatedly across role types.

File: `/Users/joshua/.claude/debug/2f023709-b303-4796-ba4c-da91616a8331.txt`

Examples:
- `tina:phase-executor, found=false` at:
  - line `5714`, `19265`, `29257`, `45783`
- fallback `SystemPrompt path=simple` adjacent to those spawn attempts.

This indicates the issue is not isolated to one teammate instance.

## 5) Comparison run: same mode (`auto`), but tmux backend path works

### 5.1 Known good orchestration run (harness)

Files:
- `/Users/joshua/.claude/teams/calculator-h20260211070408-orchestration/config.json`
- `/Users/joshua/.claude/debug/c8e097ba-8acd-4a99-adb8-c42b7864303b.txt`

Evidence:
- Team members use `backendType: "tmux"` with real pane ids (`%63`, `%64`, ...).
- Backend logs:
  - `TeammateModeSnapshot ... auto` (`:16`)
  - `[BackendRegistry] isInProcessEnabled: false (mode=auto, insideTmux=true)` (`:380`, repeated)
  - `[TmuxBackend] Created teammate pane for executor-1: %65` (`:4171`)

Conclusion:
- `mode=auto` is present in both good and bad runs.
- Effective behavior diverges on backend route:
  - `insideTmux=true` -> tmux backend (works)
  - `insideTmux=false` -> in-process backend (hits unresolved Tina agents + fallback)

## 6) Historical timeline: in-process resolution failure predates this incident

Earliest observed in-process unresolved Tina spawn in local logs:
- `2026-02-05T19:56:50.022Z` in  
  `/Users/joshua/.claude/debug/d4972dbe-b201-452d-98e6-299618e51391.txt:4051`
  - `[handleSpawnInProcess] agent_type=tina:design-validator, found=false`

Same log includes unresolved executor spawn:
- `/Users/joshua/.claude/debug/d4972dbe-b201-452d-98e6-299618e51391.txt:7506`
  - `[handleSpawnInProcess] agent_type=tina:phase-executor, found=false`

Interpretation:
- The in-process unresolved-agent signature is not new on 2026-02-11.
- The current incident is a severe manifestation where fallback behavior materially violated the executor contract.

## 7) Key technical finding (root-cause hypothesis)

### 7.1 What appears broken

In in-process teammate spawn path, agent resolution for Tina agent types fails (`found=false`) and system prompt falls back to `simple`.

Observed chain:
1. Plugin agents are loaded (22 agents).
2. Spawn requested with `agent_type=tina:<role>`.
3. In-process handler logs `found=false`.
4. Runner starts with `[SystemPrompt] path=simple`.
5. Teammate behaves as generic agent; executor can run inline work rather than phase-run contract.

### 7.2 Why this explains “used to be reliable, now not”

Evidence suggests a latent in-process resolution defect has existed for days. Reliability depended on whether:
- orchestration was routed to tmux backend (works), or
- generic fallback happened to behave acceptably for a given task.

As executor duties became stricter (worktree + `tina-session start`/wait contract), generic fallback became visibly wrong.

## 8) Scope and impact

Scope:
- Affects in-process teammate spawns for Tina role agents (`design-validator`, `plan-validator`, `phase-planner`, `phase-executor`, `phase-reviewer`, `worktree-setup`) in observed runs.

Impact:
- Executor behavior diverges from orchestration architecture contract.
- Phase execution may proceed without expected Tina lifecycle and in incorrect working directory context.
- Results can look superficially complete while violating orchestration invariants.

## 9) Non-findings / clarified assumptions

- The README “Important” warning is not hallucinated; it exists in repo history (`commit 60b1ada`).
- This is not best explained as “teammateMode changed from tmux to something else” alone:
  - both good and bad runs are `mode=auto`
  - backend route outcome is what differs.

## 10) Open technical question to close

What exact lookup contract is broken in in-process spawn?
- Candidate: mismatch between namespaced spawn types (`tina:phase-executor`) and in-process agent registry lookup keys.
- Secondary possibility: in-process resolver path skipping plugin-agent registry entirely.

This requires inspection in Claude Code internals; local logs strongly indicate the failure but not the precise code defect.

## 11) Artifact index

- Architecture contract: `/Users/joshua/Projects/tina/docs/architecture/orchestration-architecture.md:24`
- Latest failing team config: `/Users/joshua/.claude/teams/steady-sprouting-dijkstra/config.json`
- Latest failing lead log: `/Users/joshua/.claude/debug/f529838e-b7d0-463e-b2fc-a1edcd59cfa5.txt`
- Prior failing lead log: `/Users/joshua/.claude/debug/2f023709-b303-4796-ba4c-da91616a8331.txt`
- Known good tmux-backed run:
  - `/Users/joshua/.claude/teams/calculator-h20260211070408-orchestration/config.json`
  - `/Users/joshua/.claude/debug/c8e097ba-8acd-4a99-adb8-c42b7864303b.txt`
- Historical early unresolved in-process run:
  - `/Users/joshua/.claude/debug/d4972dbe-b201-452d-98e6-299618e51391.txt`
