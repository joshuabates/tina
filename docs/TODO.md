- Revamp agent instrauctions. There should be a clear and full tina-session doc
- Should we even use an orchestration team? Maybe the daemon should be responsible for kicking off and watching? Or maybe the daemon should
 have be monitoring all orchestrations so it can get stuck runs going again
- We need a better standard for using worktrees with services and ports
- We should rename orchestrations to runs?
- We should have a better name for the phase teams
- We need to switch to running in convex prod
- Fix: There's a worktree isolation hook blocking git operations on the main repo. This makes sense for phase teammates but not for the orchestrator doing the final merge. You'll need to run this manually:
