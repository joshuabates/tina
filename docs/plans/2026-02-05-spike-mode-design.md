# Spike Mode

## Problem Statement

The tina workflow (brainstorm → design → orchestrate) works well when the design is fully understood. But designs often contain open questions — "will Redis handle our throughput?", "does the existing middleware support WebSockets?", "which of these three libraries actually fits our constraints?" — that can't be answered through brainstorming alone.

Currently, there's no mechanism to explore these unknowns before committing to orchestrated execution. Uncertainty is handled implicitly through phased implementation, but that means burning full orchestration cycles (plan → execute → review) on work that might need to be thrown away. Orchestration is designed to run to completion without a human in the loop — it's the wrong tool for exploratory work that generates new questions.

We need a spike mode: a way to identify unknowns during brainstorming, run focused experiments to answer them, and feed findings back into the design before orchestration begins.

## Design

### Spike Lifecycle

```
Brainstorm
  ├── Design doc (with TBD sections for unknowns)
  ├── Spike plan (targeting those TBDs)
  │
  ▼
Human reviews, kicks off spike (/spike <path>)
  │
  ▼
Spike execution (team-based, human-in-the-loop)
  ├── Spike lead coordinates
  ├── Experimenters run experiments in throwaway worktree
  ├── Experimenters can ask lead for help when stuck
  │
  ▼
Spike produces:
  ├── Findings doc (committed to main worktree)
  ├── Proposed design doc revisions (for TBD sections)
  ├── Throwaway worktree (kept for reference, not merged)
  │
  ▼
Human reviews findings, updates design doc
  │
  ▼
Design is TBD-free → architect review → orchestrate
```

### Brainstorming Integration

During brainstorming, unknowns surface naturally — "I'm not sure if X will work", "we'd need to test whether Y can handle Z." Rather than papering over this uncertainty, the brainstorming skill captures it.

**TBD sections in design docs:**

When the brainstorming session identifies an unknown, the design doc marks it explicitly:

```markdown
## Phase 2: Caching Layer

TBD: Need to determine whether Redis or in-memory caching is appropriate
for our access patterns. Expected ~10k reads/sec with 500MB working set.

Once caching strategy is determined:
- Implement cache middleware
- Add cache invalidation on writes
- Add monitoring for hit rates
```

**Fork at the end of brainstorming:**

When the brainstorming skill would normally ask "Ready to set up for implementation?", it checks for TBD sections:

- **No TBDs** → architect review → orchestrate (current flow, unchanged)
- **Has TBDs** → "This design has open questions. Want to brainstorm a spike plan to resolve them?"

If yes, the brainstorming session continues but shifts focus to designing the experiments. The output is two artifacts from one conversation:

1. `docs/plans/YYYY-MM-DD-<topic>-design.md` (with TBD sections)
2. `docs/plans/YYYY-MM-DD-<topic>-spike.md` (targeting those TBDs)

### Spike Plan Document

The spike plan is a self-contained markdown file. It must contain everything a fresh agent needs to execute the spike without conversational context from brainstorming.

```markdown
# Spike: <topic>

## Design Reference
- Design doc: `docs/plans/YYYY-MM-DD-<topic>-design.md`
- TBD sections to resolve:
  - "## Phase 2: Caching Layer" — caching strategy (Redis vs in-memory)
  - "## Architecture" — WebSocket support in auth middleware

## Questions
1. Can Redis handle 10k reads/sec with 500MB working set on a single node?
   → Resolves TBD in "## Phase 2: Caching Layer"
2. Does the existing auth middleware pass through WebSocket upgrade requests?
   → Resolves TBD in "## Architecture"

## Experiments

### Experiment 1: Redis throughput test (answers Q1)
- Set up a local Redis instance with representative data
- Write a load test simulating our read patterns
- Measure throughput and latency at target load
- Test with and without connection pooling
- **Success looks like:** Clear throughput numbers at 10k reads/sec,
  with p99 latency under 50ms

### Experiment 2: Auth middleware WebSocket passthrough (answers Q2)
- Write a minimal WebSocket server behind the auth middleware
- Attempt connection with valid auth token
- Check if upgrade headers survive the middleware chain
- **Success looks like:** Either confirmed working or identified
  specific middleware that blocks upgrade requests

## Constraints
- Prototype only — no production quality needed
- Code is throwaway (will not be merged)

## Output
For each question, produce:
1. Answer with evidence (benchmarks, test output, code that worked/didn't)
2. Proposed revision to the specific TBD section in the design doc
```

### Spike Skill (`/spike`)

Invoked by the human: `/spike docs/plans/2026-02-05-caching-spike.md`

The spike skill is the coordinator. It never writes experiment code itself — it dispatches experimenters and synthesizes results.

**Skill workflow:**

1. **Parse spike plan** — Read the document, extract design doc reference, questions, experiments
2. **Set up throwaway worktree** — Using `tina:using-git-worktrees` for isolation
3. **Create team** — Spike lead + experimenter agents
4. **Create tasks** — One task per experiment, with full experiment description and question context in task metadata
5. **Dispatch experimenters** — Spawn experimenter agents, parallel when experiments are independent
6. **Collect results** — As experimenters report back, accumulate findings
7. **Handle experimenter questions** — Experimenters can message the spike lead when stuck; lead provides guidance or redirects
8. **Synthesize findings** — Write findings doc to main worktree (not the throwaway worktree)
9. **Propose design revisions** — For each TBD section, write a concrete proposed revision in the findings doc
10. **Clean up team** — Shut down experimenters, leave worktree intact for reference

### Experimenter Agent (`tina:experimenter`)

A new agent type purpose-built for exploratory work. Key differences from normal implementation agents:

**Knows this is throwaway:**
- No TDD requirement
- No code quality standards
- No spec/code reviewers
- Goal is learning, not shipping

**Structured output:**
- Must answer the specific question assigned
- Must provide evidence (test output, benchmarks, code snippets)
- Must propose a revision for the relevant TBD section

**Can ask for help:**
- Messages spike lead when stuck or when the experiment raises new questions
- Lead can provide additional context, redirect the approach, or escalate to the human

**Agent definition:**

```yaml
name: experimenter
description: |
  Runs a single spike experiment in an isolated worktree.
  Writes throwaway code to answer a specific question.
  Reports findings with evidence and proposed design revisions.
model: sonnet
```

### Spike Findings Document

Written by the spike lead to the main worktree after all experiments complete:

```markdown
# Spike Findings: <topic>

## Summary
Brief overview of what was learned across all experiments.

## Findings

### Q1: Can Redis handle 10k reads/sec with 500MB working set?
**Answer:** Yes, comfortably. Single node handles 45k reads/sec at p99 < 12ms
with connection pooling (pool size 20).

**Evidence:**
- Benchmark output: [included]
- Without pooling: 8k reads/sec (below target)
- With pooling (size 20): 45k reads/sec, p99 11.7ms
- Memory usage stable at 520MB

**Proposed design revision for "## Phase 2: Caching Layer":**
```
Use Redis with connection pooling (pool size 20). Single node is sufficient
for expected load. Implement cache middleware using the `redis` crate with
`bb8` connection pool. Cache invalidation on writes using key-based expiry
(TTL 5min) plus explicit invalidation on mutations.
```

### Q2: Does auth middleware pass through WebSocket upgrades?
**Answer:** No. The `validate_session` middleware strips upgrade headers.

**Evidence:**
- Test server received connection attempts but upgrade never reached handler
- Traced through middleware chain: `validate_session` in `src/middleware/auth.rs:47`
  calls `next.run(req)` but first normalizes headers, dropping non-standard ones
- WebSocket `Upgrade` and `Connection` headers are stripped at line 52

**Proposed design revision for "## Architecture":**
```
WebSocket connections must bypass the validate_session middleware.
Add a separate auth path for WS that validates the token from the
initial HTTP upgrade request query parameter (?token=xxx) rather
than headers. Route: /ws/* → ws_auth_middleware → ws_handler.
```

## Throwaway Worktree
Located at: <path>
Contains prototype code for reference. Do not merge.

## Open Questions
Any new questions that surfaced during the spike that weren't in
the original plan.
```

### Execution Model

The spike uses tina's team machinery but with a lighter configuration than orchestration:

**Team structure:**
```
spike-<topic>
  ├── spike-lead (runs /spike skill, coordinates)
  ├── experimenter-1 (experiment 1)
  ├── experimenter-2 (experiment 2, parallel if independent)
  └── ...
```

**What's different from orchestration:**
- No planner agent — experiments are pre-defined in the spike plan
- No reviewer agents — code quality is irrelevant for throwaway work
- No design validator — the spike plan is lightweight, no metrics to validate
- No remediation cycles — if an experiment fails, that's a valid finding
- Experimenters can message the lead — two-way communication, not just status reports

**What's the same:**
- Team creation via Teammate tool
- Task-based coordination via TaskCreate/TaskUpdate
- Worktree isolation via `tina:using-git-worktrees`
- Message-based communication via SendMessage

## Phases

### Phase 1: Experimenter Agent + Spike Skill

Core machinery — the ability to run a spike from a spike plan document.

**Deliverables:**
- New `agents/experimenter.md` — agent definition for exploratory work
- New `skills/spike/SKILL.md` — skill that reads spike plan, creates team, dispatches experimenters, synthesizes findings
- Findings document template and output format

**Scope:**
- Experimenter agent: reads task metadata, executes experiment in worktree, reports findings + proposed revision
- Spike skill: parses spike plan, creates throwaway worktree, creates team and tasks, spawns experimenters, handles messages, writes findings doc to main worktree, cleans up team
- Experimenter-to-lead communication for stuck/blocked states

### Phase 2: Brainstorming Integration

Connect spike mode to the brainstorming workflow.

**Deliverables:**
- Modified `skills/brainstorming/SKILL.md` — TBD detection, spike plan authoring fork

**Scope:**
- Brainstorming recognizes unknowns and writes TBD sections in design docs
- After design presentation, detects TBD sections and offers spike plan brainstorming
- Spike plan authoring within the brainstorming conversation (same session, shift focus)
- Two-artifact output: design doc + spike plan
- Updated "After the Design" flow with spike path

## Success Metrics

**Goal:** Enable exploratory work to resolve design unknowns before committing to orchestrated implementation. Designs entering orchestration should have zero TBD sections.

**Baseline command:**
```bash
# No automated baseline — this is a new capability
echo "N/A - new feature"
```

**Progress command:**
```bash
# Check that spike findings docs exist and spike plans are being generated
ls docs/plans/*-spike.md docs/plans/*-spike-findings.md 2>/dev/null | wc -l
```

**ROI threshold:** N/A — infrastructure work enabling better design quality.

**Phase estimates:**
| Phase | Expected Deliverable | Target Files |
|-------|---------------------|--------------|
| 1 | Experimenter agent + spike skill | agents/experimenter.md, skills/spike/SKILL.md |
| 2 | Brainstorming integration | skills/brainstorming/SKILL.md |

## Architectural Context

**Patterns to follow:**
- Skill frontmatter + workflow: `skills/quick-plan/SKILL.md:1-4` (YAML name/description, then markdown process)
- Agent definition format: `agents/phase-executor.md:1-7` (YAML name/description/model, then Reading Your Task → Boundaries → Steps → Communication)
- Team creation: `skills/orchestrate/SKILL.md:69-78` (Teammate tool with spawnTeam operation)
- Task-first spawning: `skills/orchestrate/SKILL.md:508` — "Tasks carry WHAT (metadata), agent definitions carry HOW (methodology), spawn prompts are minimal (just task ID)"
- Task metadata propagation: `skills/orchestrate/SKILL.md:510-523` (read metadata from completed tasks, update next task before spawning)
- Message handling event loop: `skills/orchestrate/SKILL.md:180-264` (wait for teammate messages, parse structured responses, dispatch next action)
- Parallel agent dispatch: `skills/dispatching-parallel-agents/SKILL.md:46-81` (identify independent work, spawn all at once, collect results)
- Worktree isolation: `skills/using-git-worktrees/SKILL.md:75-143` (create in .worktrees/, verify gitignored, auto-detect setup)

**Code to reuse:**
- `skills/orchestrate/SKILL.md` — team creation, task dependency setup, message parsing event loop (spike skill is a lighter version of the orchestrator)
- `skills/using-git-worktrees/SKILL.md` — worktree creation with safety verification
- `skills/dispatching-parallel-agents/SKILL.md` — parallel agent dispatch and result collection pattern

**Anti-patterns:**
- Don't load experiment content into spike lead context — pass via task metadata (paths not content principle from `docs/architecture/orchestration-vision.md`)
- Don't use orchestrate's reviewer/planner/validator machinery — spike is intentionally lightweight
- Don't auto-delete the throwaway worktree — human decides when to clean up
- Don't use sequential experimenter dispatch when experiments are independent — parallel by default

**Integration:**
- Entry: User invokes `/spike <spike-plan-path>` in their session
- Connects to: brainstorming skill (upstream, produces spike plan) → spike skill → experimenters → findings doc → human reviews → design doc updated → architect review → orchestrate (downstream)
- State: task metadata on team `spike-<topic>`, findings doc in main worktree at `docs/plans/`

**New patterns this introduces:**
- Throwaway worktree (created for exploration, never merged, kept for reference)
- Two-way agent communication (experimenters can ask lead for help, not just report completion)
- Dual-artifact brainstorming output (design doc + spike plan from same session)
- TBD sections as first-class markers in design docs (detected by brainstorming, resolved by spikes)
