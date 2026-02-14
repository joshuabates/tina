# Project Flow: Idea to Orchestration - Wireframe Handoff

## Purpose
This set explores project-management information architecture for a flow that starts with quick idea intake and ends with orchestration launch.

Primary user:
- Product or engineering lead coordinating planning and execution kickoff.

Top goals:
- Capture mixed work item types quickly (`idea`, `bug`, `story`, `design`).
- Move cards through brainstorm and design-plan stages with clear ownership.
- Configure and start orchestration directly from an approved design-plan section.

## Included Pages
1. Quick idea
2. Brainstorm
3. Design plan
4. Orchestration launch

All options expose these pages via the same stage rail, then vary layout priority.

## Option Summary
Option B only:
- Split into two distinct pages:
- `Project tasks/designs`: mixed-type kanban + design plan workspace + design cards with `Launch as orchestration`.
- `New orchestration`: orchestration-only page with compact preset selector inside launch panel.
- Pages are isolated: project page has no launch controls, orchestration page has no triage workspace.
- Best when teams want strict separation between triage/planning and orchestration startup.

## Data States
A wireframe state toggle is included:
- `normal`
- `loading`
- `empty`
- `error`

This is intentional to validate resilience of hierarchy under imperfect data.

## Files
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/meta.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/data.ts`
- `/Users/joshua/Projects/tina/designs/src/designSets/project-idea-to-orchestration/index.tsx`

## Run
```bash
cd /Users/joshua/Projects/tina/designs
npm run dev
```

Build:
```bash
npm run build
```
