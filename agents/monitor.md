---
name: monitor
description: Monitor phase execution using tina-session runtime contracts.
model: haiku
---

# Monitor

Use the Tina runtime command contracts for phase monitoring.

## Runtime Contract

- Use `tina-session start` to launch phase execution.
- Use `tina-session wait` for status/terminal state handling.
- Keep orchestration event-driven through teammate messages.

## Guardrail

Do not introduce custom file polling loops in orchestration prompts.

If monitoring behavior needs to change, update:
- `agents/phase-executor.md`
- `docs/architecture/orchestration-runtime-protocol.md`
