# Supersonic Cleanup Design

Fork of Superpowers, stripped down for Claude Code only.

## Removals

| Item | Reason |
|------|--------|
| `.opencode/` | OpenCode support removed |
| `hooks/` | Not needed, skill discovery via CLAUDE.md |
| `lib/` | Used by hooks, no longer needed |
| `docs/README.codex.md` | Codex support removed |
| `docs/README.opencode.md` | OpenCode support removed |
| `docs/plans/` (old files) | Historical planning docs |
| `docs/windows/` | Windows compatibility docs |
| `skills/executing-plans/` | Replaced by renamed subagent-driven-development |

## Renames and Consolidations

| Action | Details |
|--------|---------|
| Rename `skills/subagent-driven-development/` → `skills/executing-plans/` | Simpler naming, matches command |
| Extract `implementer` agent → `agents/implementer.md` | From executing-plans skill |
| Extract `spec-reviewer` agent → `agents/spec-reviewer.md` | From executing-plans skill |

Agents directory will have 3 formal agent definitions:
- `code-reviewer.md` (existing)
- `implementer.md` (new, extracted)
- `spec-reviewer.md` (new, extracted)

## Updates Required

| File | Changes |
|------|---------|
| `commands/execute-plan.md` | Point to `executing-plans` skill |
| `skills/*/SKILL.md` | Remove any Codex/OpenCode references |
| `skills/using-superpowers/SKILL.md` | Strip multi-agent instructions, Claude Code only |
| `agents/code-reviewer.md` | Update if it references other agents/Codex |
| `.claude-plugin/plugin.json` | Update name, author, version, repo |
| `.claude-plugin/marketplace.json` | Update with your info |
| `README.md` | Rewrite for your fork |
| `tests/` | Update references to renamed skill |

## Final Structure

```
supersonic/
├── .claude-plugin/          # Plugin config (updated)
├── agents/                  # Subagent definitions
│   ├── code-reviewer.md
│   ├── implementer.md       # Extracted
│   └── spec-reviewer.md     # Extracted
├── commands/                # Command shortcuts
│   ├── brainstorm.md
│   ├── execute-plan.md
│   └── write-plan.md
├── docs/
│   └── testing.md
├── skills/                  # 13 skills (Claude Code only)
│   ├── executing-plans/     # Renamed from subagent-driven-development
│   └── ... (12 others)
├── tests/                   # Updated test suite
├── LICENSE
└── README.md
```
