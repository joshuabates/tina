# Phase 3 -- Domain Components

## Scope

Build 12 domain-specific components on top of the Phase 2 shadcn primitives (Badge, Button, Card, ScrollArea, Separator, Tooltip) and write Storybook stories for each one. These components are presentational -- they accept props and render UI. No data fetching, no Convex hooks. At the end of this phase, Storybook has a complete "Domain" story section with all components rendering correctly against the dark design tokens. The existing app continues to build unchanged.

## Prerequisites

Phases 1 and 2 are complete. The following are in place:
- Design tokens in `src/index.css` (CSS custom properties including status semantic tokens)
- Tailwind config extended with status colors (`status-complete`, `status-executing`, etc.), fonts, border-radius
- `cn()` utility in `src/lib/utils.ts` (clsx + tailwind-merge)
- shadcn primitives: Badge, Button, Card, ScrollArea, Separator, Tooltip in `src/components/ui/`
- Storybook 8 configured with dark theme, `../src/index.css` imported in preview
- `class-variance-authority` available for variant styling

## Tasks

### Task 1: Create StatusBadge component

The most reused domain component. Consolidates the duplicated `statusColor()` / `statusBadgeClass()` switch statements currently in `Dashboard.tsx:5-13`, `OrchestrationList.tsx:15-26`, `TaskList.tsx:17-28`, `OrchestrationDetail.tsx:12-22`.

**File:** `tina-web/src/components/ui/status-badge.tsx`

```tsx
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const statusBadgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[8px] font-bold uppercase shrink-0 border",
  {
    variants: {
      status: {
        complete:
          "text-status-complete border-status-complete/30 bg-status-complete/10",
        executing:
          "text-status-executing border-status-executing/30 bg-status-executing/20",
        active:
          "text-status-active border-status-active/30 bg-status-active/10",
        planning:
          "text-status-planning border-muted bg-transparent",
        blocked:
          "text-status-blocked border-status-blocked/30 bg-status-blocked/10",
        reviewing:
          "text-status-warning border-status-warning/30 bg-status-warning/10",
        done:
          "text-status-complete border-status-complete/30 bg-status-complete/10",
        pending:
          "text-status-planning border-muted bg-transparent",
        in_progress:
          "text-status-executing border-status-executing/30 bg-status-executing/20",
      },
    },
    defaultVariants: {
      status: "planning",
    },
  }
);

type StatusBadgeStatus = NonNullable<
  VariantProps<typeof statusBadgeVariants>["status"]
>;

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status: StatusBadgeStatus;
  label?: string;
}

function StatusBadge({ status, label, className, ...props }: StatusBadgeProps) {
  const displayLabel = label ?? status.replace("_", " ");
  return (
    <span
      className={cn(statusBadgeVariants({ status }), className)}
      {...props}
    >
      {displayLabel}
    </span>
  );
}

export { StatusBadge, statusBadgeVariants };
export type { StatusBadgeProps, StatusBadgeStatus };
```

**Verification:** `npm run build` passes, TypeScript has no errors.

### Task 2: Write StatusBadge stories

**File:** `tina-web/src/components/ui/status-badge.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { StatusBadge } from "./status-badge";

const meta: Meta<typeof StatusBadge> = {
  title: "Domain/StatusBadge",
  component: StatusBadge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof StatusBadge>;

export const Complete: Story = {
  args: { status: "complete" },
};

export const Executing: Story = {
  args: { status: "executing" },
};

export const Active: Story = {
  args: { status: "active" },
};

export const Planning: Story = {
  args: { status: "planning" },
};

export const Blocked: Story = {
  args: { status: "blocked" },
};

export const Reviewing: Story = {
  args: { status: "reviewing" },
};

export const Done: Story = {
  args: { status: "done" },
};

export const Pending: Story = {
  args: { status: "pending" },
};

export const InProgress: Story = {
  args: { status: "in_progress" },
};

export const CustomLabel: Story = {
  args: { status: "executing", label: "RUNNING" },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="complete" />
      <StatusBadge status="executing" />
      <StatusBadge status="active" />
      <StatusBadge status="planning" />
      <StatusBadge status="blocked" />
      <StatusBadge status="reviewing" />
      <StatusBadge status="done" />
      <StatusBadge status="pending" />
      <StatusBadge status="in_progress" />
    </div>
  ),
};
```

### Task 3: Create MonoText component

Inline span with JetBrains Mono for displaying IDs, hashes, file counts, timestamps.

**File:** `tina-web/src/components/ui/mono-text.tsx`

```tsx
import { cn } from "@/lib/utils";

interface MonoTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
}

function MonoText({ className, children, ...props }: MonoTextProps) {
  return (
    <span className={cn("font-mono", className)} {...props}>
      {children}
    </span>
  );
}

export { MonoText };
export type { MonoTextProps };
```

### Task 4: Write MonoText stories

**File:** `tina-web/src/components/ui/mono-text.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { MonoText } from "./mono-text";

const meta: Meta<typeof MonoText> = {
  title: "Domain/MonoText",
  component: MonoText,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof MonoText>;

export const CommitHash: Story = {
  args: { children: "b92ae13" },
  decorators: [
    (Story) => (
      <span className="text-sm">
        <Story />
      </span>
    ),
  ],
};

export const Version: Story = {
  args: { children: "v2.4.12-stable", className: "text-2xs opacity-40" },
};

export const Duration: Story = {
  args: { children: "45m", className: "text-2xs" },
};

export const FileCounts: Story = {
  render: () => (
    <div className="flex items-center gap-2 text-sm">
      <MonoText>14 files</MonoText>
      <MonoText className="text-status-complete">+382</MonoText>
      <MonoText className="text-status-blocked">-96</MonoText>
    </div>
  ),
};
```

### Task 5: Create TaskCard component

Task card with colored left border, task ID, subject, assignee, duration, and status badge. Matches the mockup's `.task-card` pattern.

**File:** `tina-web/src/components/ui/task-card.tsx`

```tsx
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";
import { MonoText } from "./mono-text";

interface TaskCardProps extends React.HTMLAttributes<HTMLDivElement> {
  taskId: string;
  subject: string;
  status: StatusBadgeStatus;
  assignee?: string;
  duration?: string;
  blockedReason?: string;
}

const borderColorMap: Record<string, string> = {
  complete: "border-l-status-complete",
  done: "border-l-status-complete",
  executing: "border-l-status-executing",
  active: "border-l-status-warning",
  in_progress: "border-l-status-warning",
  blocked: "border-l-status-blocked",
  planning: "border-l-muted",
  pending: "border-l-muted",
  reviewing: "border-l-status-warning",
};

function TaskCard({
  taskId,
  subject,
  status,
  assignee,
  duration,
  blockedReason,
  className,
  ...props
}: TaskCardProps) {
  const borderClass = borderColorMap[status] ?? "border-l-muted";

  return (
    <div
      className={cn(
        "bg-muted/40 border border-border rounded p-3 border-l-2 transition-all hover:border-muted-foreground/30",
        borderClass,
        className
      )}
      {...props}
    >
      <div className="flex justify-between items-start gap-4 w-full">
        <div className="flex-1 min-w-0">
          <MonoText className="text-[8px] text-muted-foreground block leading-none mb-1.5">
            {taskId}
          </MonoText>
          <h4 className="font-semibold text-sm leading-tight">
            {subject}
          </h4>
        </div>
        <StatusBadge status={status} />
      </div>
      {(assignee || duration) && (
        <div className="flex items-center justify-between mt-2 text-2xs opacity-60 w-full">
          {assignee && <span className="flex items-center gap-1.5">{assignee}</span>}
          {duration && <MonoText>{duration}</MonoText>}
        </div>
      )}
      {blockedReason && (
        <div className="mt-2 p-2 bg-status-blocked/5 rounded text-xs text-status-blocked border border-status-blocked/10 w-full">
          {blockedReason}
        </div>
      )}
    </div>
  );
}

export { TaskCard };
export type { TaskCardProps };
```

### Task 6: Write TaskCard stories

**File:** `tina-web/src/components/ui/task-card.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { TaskCard } from "./task-card";

const meta: Meta<typeof TaskCard> = {
  title: "Domain/TaskCard",
  component: TaskCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[500px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TaskCard>;

export const Done: Story = {
  args: {
    taskId: "P3-T1",
    subject: "Persist feedback payload to queue",
    status: "done",
    assignee: "implementer-a",
    duration: "45m",
  },
};

export const Active: Story = {
  args: {
    taskId: "P3-T2",
    subject: "Add teammate triage loop",
    status: "active",
    assignee: "implementer-b",
    duration: "1h 12m",
  },
};

export const Blocked: Story = {
  args: {
    taskId: "P3-T4",
    subject: "Contract test for queue transitions",
    status: "blocked",
    blockedReason: "Awaiting ack semantics (Section 4)",
  },
};

export const Pending: Story = {
  args: {
    taskId: "P3-T3",
    subject: "Wire up event bus integration",
    status: "pending",
  },
};

export const Executing: Story = {
  args: {
    taskId: "P2-T1",
    subject: "Generate plan from design doc",
    status: "executing",
    assignee: "planner-agent",
    duration: "12m",
  },
};

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-3">
      <TaskCard
        taskId="P3-T1"
        subject="Persist feedback payload to queue"
        status="done"
        assignee="implementer-a"
        duration="45m"
      />
      <TaskCard
        taskId="P3-T2"
        subject="Add teammate triage loop"
        status="active"
        assignee="implementer-b"
        duration="1h 12m"
      />
      <TaskCard
        taskId="P3-T4"
        subject="Contract test for queue transitions"
        status="blocked"
        blockedReason="Awaiting ack semantics (Section 4)"
      />
      <TaskCard
        taskId="P3-T3"
        subject="Wire up event bus integration"
        status="pending"
      />
    </div>
  ),
};
```

### Task 7: Create PhaseCard component

Phase summary card with phase number, name, status badge, and task/team counts. Used inside the PhaseTimeline.

**File:** `tina-web/src/components/ui/phase-card.tsx`

```tsx
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeStatus } from "./status-badge";

interface PhaseCardProps extends React.HTMLAttributes<HTMLDivElement> {
  phaseNumber: number;
  name: string;
  status: StatusBadgeStatus;
  taskCount: number;
  completedCount: number;
  teamCount: number;
}

const iconBgMap: Record<string, string> = {
  complete: "bg-status-complete",
  done: "bg-status-complete",
  executing: "bg-primary phase-glow",
  active: "bg-primary phase-glow",
  in_progress: "bg-primary phase-glow",
  reviewing: "bg-status-warning",
};

const nameColorMap: Record<string, string> = {
  complete: "text-status-complete",
  done: "text-status-complete",
  executing: "text-primary",
  active: "text-primary",
  in_progress: "text-primary",
  reviewing: "text-status-warning",
};

function PhaseCard({
  phaseNumber,
  name,
  status,
  taskCount,
  completedCount,
  teamCount,
  className,
  ...props
}: PhaseCardProps) {
  const isComplete = status === "complete" || status === "done";
  const isActive =
    status === "executing" || status === "active" || status === "in_progress";
  const isFuture = status === "planning" || status === "pending";

  const iconBg =
    iconBgMap[status] ??
    "border border-muted-foreground/30 bg-card";
  const nameColor = nameColorMap[status] ?? "text-foreground";

  return (
    <div
      className={cn(
        "flex items-start gap-3 relative z-10 w-full",
        isFuture && "opacity-60",
        className
      )}
      {...props}
    >
      <div
        className={cn(
          "w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-white",
          iconBg
        )}
      >
        {isComplete ? (
          <span className="text-[14px] font-bold leading-none">&#10003;</span>
        ) : isActive ? (
          <span className="text-[14px] leading-none">&#9654;</span>
        ) : (
          <span className="text-[10px] font-bold text-muted-foreground">
            {phaseNumber}
          </span>
        )}
      </div>
      <div className="flex flex-col flex-1 gap-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={cn("font-bold text-xs truncate", nameColor)}>
            P{phaseNumber} {name}
          </h3>
          <StatusBadge status={status} />
        </div>
        <p className="text-2xs text-muted-foreground font-medium">
          {taskCount} tasks | {completedCount} done | {teamCount} team
        </p>
      </div>
    </div>
  );
}

export { PhaseCard };
export type { PhaseCardProps };
```

Note: The `phase-glow` class needs to be defined. Add it to `src/index.css` in the `@layer components` block:

```css
@layer components {
  .phase-glow {
    box-shadow: 0 0 12px color-mix(in srgb, hsl(var(--primary)) 40%, transparent);
  }
}
```

### Task 8: Write PhaseCard stories

**File:** `tina-web/src/components/ui/phase-card.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { PhaseCard } from "./phase-card";

const meta: Meta<typeof PhaseCard> = {
  title: "Domain/PhaseCard",
  component: PhaseCard,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[260px]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PhaseCard>;

export const Complete: Story = {
  args: {
    phaseNumber: 1,
    name: "Design alignment",
    status: "complete",
    taskCount: 4,
    completedCount: 4,
    teamCount: 4,
  },
};

export const Executing: Story = {
  args: {
    phaseNumber: 3,
    name: "Execution",
    status: "executing",
    taskCount: 4,
    completedCount: 1,
    teamCount: 4,
  },
};

export const Planning: Story = {
  args: {
    phaseNumber: 4,
    name: "Phase review",
    status: "planning",
    taskCount: 4,
    completedCount: 0,
    teamCount: 4,
  },
};

export const Reviewing: Story = {
  args: {
    phaseNumber: 2,
    name: "Plan generation",
    status: "reviewing",
    taskCount: 4,
    completedCount: 3,
    teamCount: 4,
  },
};

export const Blocked: Story = {
  args: {
    phaseNumber: 5,
    name: "Integration tests",
    status: "blocked",
    taskCount: 6,
    completedCount: 2,
    teamCount: 3,
  },
};
```

### Task 9: Create PhaseTimeline component

Vertical timeline connecting multiple PhaseCards with a connecting line and glow on the active phase.

**File:** `tina-web/src/components/ui/phase-timeline.tsx`

```tsx
import { cn } from "@/lib/utils";
import { PhaseCard, type PhaseCardProps } from "./phase-card";

interface PhaseTimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  phases: Omit<PhaseCardProps, "className">[];
}

function PhaseTimeline({ phases, className, ...props }: PhaseTimelineProps) {
  return (
    <div className={cn("flex flex-col gap-8 relative py-6 px-4", className)} {...props}>
      {/* Vertical connecting line */}
      <div className="absolute left-[1.75rem] top-0 bottom-0 w-px bg-border" />
      {phases.map((phase) => (
        <PhaseCard key={phase.phaseNumber} {...phase} />
      ))}
    </div>
  );
}

export { PhaseTimeline };
export type { PhaseTimelineProps };
```

### Task 10: Write PhaseTimeline stories

**File:** `tina-web/src/components/ui/phase-timeline.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { PhaseTimeline } from "./phase-timeline";

const meta: Meta<typeof PhaseTimeline> = {
  title: "Domain/PhaseTimeline",
  component: PhaseTimeline,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-[280px] bg-card rounded border border-border overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof PhaseTimeline>;

export const Default: Story = {
  args: {
    phases: [
      { phaseNumber: 1, name: "Design alignment", status: "complete", taskCount: 4, completedCount: 4, teamCount: 4 },
      { phaseNumber: 2, name: "Plan generation", status: "complete", taskCount: 4, completedCount: 4, teamCount: 4 },
      { phaseNumber: 3, name: "Execution", status: "executing", taskCount: 4, completedCount: 1, teamCount: 4 },
      { phaseNumber: 4, name: "Phase review", status: "planning", taskCount: 4, completedCount: 0, teamCount: 4 },
      { phaseNumber: 5, name: "Wrap-up", status: "planning", taskCount: 4, completedCount: 0, teamCount: 4 },
    ],
  },
};

export const AllComplete: Story = {
  args: {
    phases: [
      { phaseNumber: 1, name: "Design alignment", status: "complete", taskCount: 3, completedCount: 3, teamCount: 2 },
      { phaseNumber: 2, name: "Implementation", status: "complete", taskCount: 5, completedCount: 5, teamCount: 4 },
      { phaseNumber: 3, name: "Review", status: "complete", taskCount: 2, completedCount: 2, teamCount: 3 },
    ],
  },
};

export const WithBlocked: Story = {
  args: {
    phases: [
      { phaseNumber: 1, name: "Setup", status: "complete", taskCount: 2, completedCount: 2, teamCount: 2 },
      { phaseNumber: 2, name: "Core work", status: "blocked", taskCount: 6, completedCount: 3, teamCount: 4 },
      { phaseNumber: 3, name: "Finalize", status: "pending", taskCount: 3, completedCount: 0, teamCount: 3 },
    ],
  },
};
```

### Task 11: Create SidebarItem component

Individual navigation item with active/hover states and optional status badge.

**File:** `tina-web/src/components/ui/sidebar-item.tsx`

```tsx
import { cn } from "@/lib/utils";

interface SidebarItemProps extends React.HTMLAttributes<HTMLDivElement> {
  label: string;
  active?: boolean;
  statusText?: string;
  statusColor?: string;
}

function SidebarItem({
  label,
  active = false,
  statusText,
  statusColor = "text-muted-foreground",
  className,
  ...props
}: SidebarItemProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-2 py-0.5 cursor-pointer text-xs rounded transition-colors",
        active
          ? "bg-muted/50 text-foreground"
          : "text-muted-foreground hover:bg-muted/30 hover:text-foreground",
        className
      )}
      {...props}
    >
      <span className="truncate">{label}</span>
      {statusText && (
        <span className={cn("text-[7px] font-bold opacity-60 shrink-0 ml-2", statusColor)}>
          {statusText}
        </span>
      )}
    </div>
  );
}

export { SidebarItem };
export type { SidebarItemProps };
```

### Task 12: Create SidebarNav component

Collapsible project tree with nested items. Shows project folders with expandable orchestration lists.

**File:** `tina-web/src/components/ui/sidebar-nav.tsx`

```tsx
import { cn } from "@/lib/utils";
import { SidebarItem, type SidebarItemProps } from "./sidebar-item";

interface SidebarProject {
  name: string;
  active?: boolean;
  items: Omit<SidebarItemProps, "className">[];
}

interface SidebarNavProps extends React.HTMLAttributes<HTMLDivElement> {
  projects: SidebarProject[];
}

function SidebarNav({ projects, className, ...props }: SidebarNavProps) {
  return (
    <div className={cn("flex flex-col overflow-hidden bg-sidebar", className)} {...props}>
      <div className="px-2 py-1.5 border-b border-border/50 bg-muted/20">
        <h2 className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
          PROJECTS
        </h2>
      </div>
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
        {projects.map((project) => (
          <div key={project.name}>
            <div
              className={cn(
                "flex items-center gap-1.5 px-2 py-1 cursor-pointer rounded transition-colors",
                project.active
                  ? "bg-muted/50 text-primary"
                  : "text-muted-foreground hover:bg-muted/30"
              )}
            >
              <span className="text-xs font-medium flex-1 truncate">
                {project.name}
              </span>
            </div>
            {project.items.length > 0 && (
              <div className="ml-4 space-y-0.5 border-l border-border/50">
                {project.items.map((item) => (
                  <SidebarItem key={item.label} {...item} />
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export { SidebarNav };
export type { SidebarNavProps, SidebarProject };
```

### Task 13: Write SidebarItem and SidebarNav stories

**File:** `tina-web/src/components/ui/sidebar-item.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { SidebarItem } from "./sidebar-item";

const meta: Meta<typeof SidebarItem> = {
  title: "Domain/SidebarItem",
  component: SidebarItem,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-48 bg-sidebar p-1">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SidebarItem>;

export const Default: Story = {
  args: { label: "Queue workers" },
};

export const Active: Story = {
  args: { label: "Queue workers", active: true },
};

export const WithDoneStatus: Story = {
  args: { label: "Request handoff", statusText: "DONE", statusColor: "text-status-complete" },
};

export const WithActiveStatus: Story = {
  args: { label: "Queue workers", statusText: "ACTIVE", statusColor: "text-status-warning" },
};

export const WithBlockedStatus: Story = {
  args: { label: "Parser logic", statusText: "BLOCK", statusColor: "text-status-blocked" },
};
```

**File:** `tina-web/src/components/ui/sidebar-nav.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { SidebarNav } from "./sidebar-nav";

const meta: Meta<typeof SidebarNav> = {
  title: "Domain/SidebarNav",
  component: SidebarNav,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-52 h-[400px] border border-border rounded overflow-hidden">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof SidebarNav>;

export const Default: Story = {
  args: {
    projects: [
      {
        name: "tina-core",
        active: true,
        items: [
          { label: "Request handoff", statusText: "DONE", statusColor: "text-status-complete" },
          { label: "Core initialization", statusText: "DONE", statusColor: "text-status-complete" },
          { label: "Queue workers", statusText: "ACTIVE", statusColor: "text-status-warning" },
        ],
      },
      {
        name: "tina-plugin",
        items: [
          { label: "Build pipeline", statusText: "DONE", statusColor: "text-status-complete" },
        ],
      },
      {
        name: "tina-cli",
        items: [
          { label: "Parser logic", statusText: "BLOCK", statusColor: "text-status-blocked" },
        ],
      },
      {
        name: "shared-utils",
        items: [],
      },
    ],
  },
};
```

### Task 14: Create TeamMember component

Single team member row with name, status indicator dot, and status text.

**File:** `tina-web/src/components/ui/team-member.tsx`

```tsx
import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

type MemberStatus = "active" | "busy" | "idle" | "away";

interface TeamMemberProps extends React.HTMLAttributes<HTMLDivElement> {
  name: string;
  memberStatus: MemberStatus;
}

const dotColorMap: Record<MemberStatus, string> = {
  active: "bg-status-complete",
  busy: "bg-primary",
  idle: "bg-status-complete",
  away: "bg-muted-foreground",
};

const labelMap: Record<MemberStatus, string> = {
  active: "ACTIVE",
  busy: "BUSY",
  idle: "IDLE",
  away: "AWAY",
};

const labelColorMap: Record<MemberStatus, string> = {
  active: "text-status-complete",
  busy: "text-primary",
  idle: "opacity-40",
  away: "opacity-20",
};

function TeamMember({
  name,
  memberStatus,
  className,
  ...props
}: TeamMemberProps) {
  return (
    <div
      className={cn("flex items-center justify-between", className)}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "w-1.5 h-1.5 rounded-full",
            dotColorMap[memberStatus]
          )}
        />
        <span
          className={cn(
            "text-xs font-medium",
            memberStatus === "away" && "opacity-50"
          )}
        >
          {name}
        </span>
      </div>
      <MonoText className={cn("text-[8px]", labelColorMap[memberStatus])}>
        {labelMap[memberStatus]}
      </MonoText>
    </div>
  );
}

export { TeamMember };
export type { TeamMemberProps, MemberStatus };
```

### Task 15: Create TeamPanel component (design library version)

Panel listing team members with a header showing active count. This is the design library version in `src/components/ui/`, distinct from the existing `src/components/TeamPanel.tsx`.

**File:** `tina-web/src/components/ui/team-panel.tsx`

```tsx
import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";
import { TeamMember, type MemberStatus } from "./team-member";

interface TeamPanelMember {
  name: string;
  memberStatus: MemberStatus;
}

interface TeamPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  members: TeamPanelMember[];
}

function TeamPanel({ members, className, ...props }: TeamPanelProps) {
  const activeCount = members.filter(
    (m) => m.memberStatus === "active" || m.memberStatus === "busy"
  ).length;

  return (
    <div
      className={cn(
        "bg-card border border-border rounded flex flex-col overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="px-2 py-1 bg-muted/20 border-b border-border flex justify-between items-center">
        <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
          Team
        </h3>
        <MonoText className="text-[8px] text-status-complete">
          {activeCount} ACTIVE
        </MonoText>
      </div>
      <div className="p-2 space-y-2">
        {members.map((member) => (
          <TeamMember
            key={member.name}
            name={member.name}
            memberStatus={member.memberStatus}
          />
        ))}
      </div>
    </div>
  );
}

export { TeamPanel as TeamPanelUI };
export type { TeamPanelProps, TeamPanelMember };
```

### Task 16: Write TeamMember and TeamPanel stories

**File:** `tina-web/src/components/ui/team-member.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { TeamMember } from "./team-member";

const meta: Meta<typeof TeamMember> = {
  title: "Domain/TeamMember",
  component: TeamMember,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-56">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TeamMember>;

export const Idle: Story = {
  args: { name: "implementer-a", memberStatus: "idle" },
};

export const Busy: Story = {
  args: { name: "implementer-b", memberStatus: "busy" },
};

export const Active: Story = {
  args: { name: "lead-dev", memberStatus: "active" },
};

export const Away: Story = {
  args: { name: "lead-dev", memberStatus: "away" },
};

export const AllStatuses: Story = {
  render: () => (
    <div className="space-y-2">
      <TeamMember name="implementer-a" memberStatus="idle" />
      <TeamMember name="implementer-b" memberStatus="busy" />
      <TeamMember name="lead-dev" memberStatus="active" />
      <TeamMember name="reviewer" memberStatus="away" />
    </div>
  ),
};
```

**File:** `tina-web/src/components/ui/team-panel.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { TeamPanelUI } from "./team-panel";

const meta: Meta<typeof TeamPanelUI> = {
  title: "Domain/TeamPanel",
  component: TeamPanelUI,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof TeamPanelUI>;

export const Default: Story = {
  args: {
    members: [
      { name: "implementer-a", memberStatus: "idle" },
      { name: "implementer-b", memberStatus: "busy" },
      { name: "lead-dev", memberStatus: "away" },
    ],
  },
};

export const AllActive: Story = {
  args: {
    members: [
      { name: "agent-alpha", memberStatus: "active" },
      { name: "agent-beta", memberStatus: "busy" },
      { name: "agent-gamma", memberStatus: "active" },
    ],
  },
};

export const Empty: Story = {
  args: { members: [] },
};
```

### Task 17: Create StatPanel component

Generic right-sidebar info panel used for orchestration status, git operations, phase review, etc.

**File:** `tina-web/src/components/ui/stat-panel.tsx`

```tsx
import { cn } from "@/lib/utils";

interface StatPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

function StatPanel({
  title,
  headerAction,
  children,
  className,
  ...props
}: StatPanelProps) {
  return (
    <div
      className={cn(
        "bg-card border border-border rounded flex flex-col overflow-hidden",
        className
      )}
      {...props}
    >
      <div className="px-2 py-1 bg-muted/20 border-b border-border flex justify-between items-center">
        <h3 className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
          {title}
        </h3>
        {headerAction}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

export { StatPanel };
export type { StatPanelProps };
```

### Task 18: Write StatPanel stories

**File:** `tina-web/src/components/ui/stat-panel.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { StatPanel } from "./stat-panel";
import { MonoText } from "./mono-text";
import { Button } from "./button";

const meta: Meta<typeof StatPanel> = {
  title: "Domain/StatPanel",
  component: StatPanel,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div className="w-64">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StatPanel>;

export const OrchestrationStatus: Story = {
  render: () => (
    <StatPanel title="Orchestration">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] uppercase font-bold text-status-complete">EXECUTING</span>
        <MonoText className="text-[8px] text-muted-foreground">PHASE 3/5</MonoText>
      </div>
      <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
        <div className="bg-primary w-3/5 h-full rounded-full" />
      </div>
      <div className="flex justify-end mt-1">
        <MonoText className="text-[8px] text-muted-foreground">ELAPSED: 46m</MonoText>
      </div>
    </StatPanel>
  ),
};

export const GitOperations: Story = {
  render: () => (
    <StatPanel title="Git Operations">
      <div className="space-y-3">
        <div>
          <span className="text-[7px] font-bold text-muted-foreground uppercase block mb-1">Recent Commits</span>
          <div className="space-y-1">
            <div className="flex gap-2 text-2xs group cursor-pointer">
              <MonoText className="text-primary/70">b92ae13</MonoText>
              <span className="truncate opacity-80 group-hover:opacity-100">add queue ingestion worker</span>
            </div>
            <div className="flex gap-2 text-2xs group cursor-pointer">
              <MonoText className="text-primary/70">4e332f1</MonoText>
              <span className="truncate opacity-80 group-hover:opacity-100">expose queue states</span>
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-border/50">
          <span className="text-[7px] font-bold text-muted-foreground uppercase block mb-1">Diff Summary</span>
          <div className="flex items-center justify-between text-xs">
            <MonoText>14 files</MonoText>
            <span className="flex gap-2">
              <MonoText className="text-status-complete">+382</MonoText>
              <MonoText className="text-status-blocked">-96</MonoText>
            </span>
          </div>
        </div>
      </div>
    </StatPanel>
  ),
};

export const PhaseReview: Story = {
  render: () => (
    <StatPanel title="Phase Review">
      <p className="text-xs leading-tight opacity-70 mb-2">
        System awaiting acknowledgment of P3 parameters before transition to P4.
      </p>
      <Button
        variant="outline"
        className="w-full text-2xs font-bold uppercase bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
      >
        Review and Approve
      </Button>
    </StatPanel>
  ),
};
```

### Task 19: Create AppHeader component

Top bar with app title, version, and optional right-side content.

**File:** `tina-web/src/components/ui/app-header.tsx`

```tsx
import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

interface AppHeaderProps extends React.HTMLAttributes<HTMLElement> {
  title?: string;
  version?: string;
  children?: React.ReactNode;
}

function AppHeader({
  title = "ORCHESTRATOR",
  version,
  children,
  className,
  ...props
}: AppHeaderProps) {
  return (
    <header
      className={cn(
        "border-b border-border bg-sidebar px-3 py-1.5 flex justify-between items-center shrink-0",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold tracking-tighter text-primary">
          {title}
        </span>
        {version && (
          <>
            <div className="h-3 w-px bg-muted-foreground/30 mx-1" />
            <MonoText className="text-2xs opacity-40">{version}</MonoText>
          </>
        )}
      </div>
      {children && <div className="flex items-center gap-4">{children}</div>}
    </header>
  );
}

export { AppHeader };
export type { AppHeaderProps };
```

### Task 20: Create AppStatusBar component (design library version)

Bottom bar with session info and connection status. Named `AppStatusBar` to avoid collision with existing `src/components/StatusBar.tsx`.

**File:** `tina-web/src/components/ui/app-status-bar.tsx`

```tsx
import { cn } from "@/lib/utils";
import { MonoText } from "./mono-text";

interface AppStatusBarProps extends React.HTMLAttributes<HTMLElement> {
  sessionDuration?: string;
  projectName?: string;
  phaseName?: string;
  connected?: boolean;
}

function AppStatusBar({
  sessionDuration,
  projectName,
  phaseName,
  connected = true,
  className,
  ...props
}: AppStatusBarProps) {
  return (
    <footer
      className={cn(
        "bg-sidebar border-t border-border px-3 py-1 flex justify-between items-center shrink-0",
        className
      )}
      {...props}
    >
      <MonoText className="text-2xs flex gap-3 items-center">
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              connected ? "bg-status-complete" : "bg-status-blocked"
            )}
          />
          <span className="opacity-60 text-muted-foreground uppercase">
            {sessionDuration ? `Session: ${sessionDuration}` : connected ? "Connected" : "Disconnected"}
          </span>
        </span>
        {(projectName || phaseName) && (
          <span className="text-muted-foreground">
            {[projectName, phaseName].filter(Boolean).join(" / ")}
          </span>
        )}
      </MonoText>
    </footer>
  );
}

export { AppStatusBar };
export type { AppStatusBarProps };
```

### Task 21: Write AppHeader and AppStatusBar stories

**File:** `tina-web/src/components/ui/app-header.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./app-header";

const meta: Meta<typeof AppHeader> = {
  title: "Domain/AppHeader",
  component: AppHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppHeader>;

export const Default: Story = {
  args: { version: "v2.4.12-stable" },
};

export const WithSearch: Story = {
  render: () => (
    <AppHeader version="v2.4.12-stable">
      <div className="relative flex items-center bg-muted/50 rounded px-2 py-0.5 w-64">
        <input
          className="bg-transparent border-none text-xs focus:ring-0 w-full p-0 text-foreground placeholder:text-muted-foreground"
          placeholder="Jump to..."
          type="text"
        />
      </div>
    </AppHeader>
  ),
};

export const CustomTitle: Story = {
  args: { title: "TINA", version: "v1.0.0" },
};
```

**File:** `tina-web/src/components/ui/app-status-bar.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { AppStatusBar } from "./app-status-bar";

const meta: Meta<typeof AppStatusBar> = {
  title: "Domain/AppStatusBar",
  component: AppStatusBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppStatusBar>;

export const Connected: Story = {
  args: {
    sessionDuration: "46m",
    projectName: "tina-core",
    phaseName: "P3 Execution",
    connected: true,
  },
};

export const Disconnected: Story = {
  args: { connected: false },
};

export const Minimal: Story = {
  args: { connected: true },
};
```

### Task 22: Add phase-glow CSS class

Add the `phase-glow` utility class to `src/index.css` for the active phase glow effect used by PhaseCard.

**File modified:** `tina-web/src/index.css`

Add after the existing `@layer base` block:

```css
@layer components {
  .phase-glow {
    box-shadow: 0 0 12px color-mix(in srgb, hsl(var(--primary)) 40%, transparent);
  }
}
```

### Task 23: Verify everything works

1. `cd tina-web && npm run build` -- existing app still builds
2. `cd tina-web && npx tsc --noEmit` -- no TypeScript errors
3. `cd tina-web && npm run storybook` -- Storybook launches, all stories render
4. Each domain component uses design tokens (dark backgrounds, status colors, correct typography)
5. No existing files in `src/components/` were modified

## Execution Order

Tasks are grouped by dependency. Tasks within a group can be done in any order.

**Group 1 (no dependencies):**
- Task 22 (phase-glow CSS)
- Task 1-2 (StatusBadge + stories)
- Task 3-4 (MonoText + stories)

**Group 2 (depends on StatusBadge + MonoText):**
- Task 5-6 (TaskCard + stories)
- Task 7-8 (PhaseCard + stories)

**Group 3 (depends on PhaseCard):**
- Task 9-10 (PhaseTimeline + stories)

**Group 4 (no dependencies on Group 2/3):**
- Task 11-13 (SidebarItem + SidebarNav + stories)
- Task 14-16 (TeamMember + TeamPanel + stories)
- Task 17-18 (StatPanel + stories)

**Group 5 (depends on MonoText):**
- Task 19-21 (AppHeader + AppStatusBar + stories)

**Group 6:**
- Task 23 (verify)

Recommended sequential order:
```
Task 22 (phase-glow CSS)
Task 1  (StatusBadge)
Task 2  (StatusBadge stories)
Task 3  (MonoText)
Task 4  (MonoText stories)
Task 5  (TaskCard)
Task 6  (TaskCard stories)
Task 7  (PhaseCard)
Task 8  (PhaseCard stories)
Task 9  (PhaseTimeline)
Task 10 (PhaseTimeline stories)
Task 11 (SidebarItem)
Task 12 (SidebarNav)
Task 13 (SidebarItem + SidebarNav stories)
Task 14 (TeamMember)
Task 15 (TeamPanel)
Task 16 (TeamMember + TeamPanel stories)
Task 17 (StatPanel)
Task 18 (StatPanel stories)
Task 19 (AppHeader)
Task 20 (AppStatusBar)
Task 21 (AppHeader + AppStatusBar stories)
Task 23 (verify)
```

## Files Created

| File | Purpose |
|------|---------|
| `tina-web/src/components/ui/status-badge.tsx` | Status badge with color-coded variants |
| `tina-web/src/components/ui/status-badge.stories.tsx` | StatusBadge stories |
| `tina-web/src/components/ui/mono-text.tsx` | Monospace inline text |
| `tina-web/src/components/ui/mono-text.stories.tsx` | MonoText stories |
| `tina-web/src/components/ui/task-card.tsx` | Task card with status border and badge |
| `tina-web/src/components/ui/task-card.stories.tsx` | TaskCard stories |
| `tina-web/src/components/ui/phase-card.tsx` | Phase summary with icon and stats |
| `tina-web/src/components/ui/phase-card.stories.tsx` | PhaseCard stories |
| `tina-web/src/components/ui/phase-timeline.tsx` | Vertical timeline of PhaseCards |
| `tina-web/src/components/ui/phase-timeline.stories.tsx` | PhaseTimeline stories |
| `tina-web/src/components/ui/sidebar-item.tsx` | Single sidebar nav item |
| `tina-web/src/components/ui/sidebar-item.stories.tsx` | SidebarItem stories |
| `tina-web/src/components/ui/sidebar-nav.tsx` | Project tree sidebar |
| `tina-web/src/components/ui/sidebar-nav.stories.tsx` | SidebarNav stories |
| `tina-web/src/components/ui/team-member.tsx` | Team member row |
| `tina-web/src/components/ui/team-member.stories.tsx` | TeamMember stories |
| `tina-web/src/components/ui/team-panel.tsx` | Team panel with member list |
| `tina-web/src/components/ui/team-panel.stories.tsx` | TeamPanel stories |
| `tina-web/src/components/ui/stat-panel.tsx` | Generic info panel |
| `tina-web/src/components/ui/stat-panel.stories.tsx` | StatPanel stories |
| `tina-web/src/components/ui/app-header.tsx` | App top bar |
| `tina-web/src/components/ui/app-header.stories.tsx` | AppHeader stories |
| `tina-web/src/components/ui/app-status-bar.tsx` | App bottom bar |
| `tina-web/src/components/ui/app-status-bar.stories.tsx` | AppStatusBar stories |

## Files Modified

| File | Change |
|------|--------|
| `tina-web/src/index.css` | Add `@layer components` block with `.phase-glow` class |

## What NOT To Do

- Do NOT modify any existing components in `src/components/` (Dashboard, OrchestrationDetail, etc.)
- Do NOT import Convex hooks or fetch data in any component or story -- all are presentational with static props
- Do NOT modify the Phase 1/2 setup files (Storybook config, `tailwind.config.ts`, `components.json`)
- Do NOT delete or rename existing components -- the design library `TeamPanelUI` and `AppStatusBar` are intentionally named differently to coexist with `src/components/TeamPanel.tsx` and `src/components/StatusBar.tsx`
- Do NOT use Material Icons or Material Symbols -- the mockup uses them but the component library uses unicode characters and Tailwind styling instead, keeping dependencies minimal
