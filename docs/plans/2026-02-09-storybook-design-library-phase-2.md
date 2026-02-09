# Phase 2 -- shadcn Primitives

## Scope

Install the six shadcn/ui primitive components (Badge, Button, Card, ScrollArea, Separator, Tooltip) into `tina-web/` and write Storybook stories for each one showing themed variants. At the end of this phase, Storybook displays stories for all six primitives rendered correctly with the dark design tokens from Phase 1. The existing app continues to build unchanged.

## Prerequisites

Phase 1 is complete. The following are in place:
- `components.json` configured with `style: "new-york"`, `@/components/ui` alias
- `src/lib/utils.ts` with `cn()` utility (clsx + tailwind-merge)
- Design tokens in `src/index.css` (CSS custom properties)
- Tailwind config extended with design token colors, fonts, border-radius
- Storybook 8 configured with dark theme and `../src/index.css` imported in preview
- `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tailwindcss-animate` already in dependencies

## Tasks

### Task 1: Install shadcn Badge component

Run `npx shadcn@latest add badge` in `tina-web/`.

This creates `src/components/ui/badge.tsx` using `class-variance-authority` for variant styling. The component uses the design token CSS variables via Tailwind classes.

**Files created:**
- `tina-web/src/components/ui/badge.tsx`

**Verification:** File exists, imports resolve, `npm run build` passes.

### Task 2: Write Badge stories

Create stories showing all badge variants with the design tokens applied.

**File:** `tina-web/src/components/ui/badge.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Badge } from "./badge";

const meta: Meta<typeof Badge> = {
  title: "Primitives/Badge",
  component: Badge,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Badge>;

export const Default: Story = {
  args: { children: "Default" },
};

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
};

export const Destructive: Story = {
  args: { children: "Destructive", variant: "destructive" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="destructive">Destructive</Badge>
      <Badge variant="outline">Outline</Badge>
    </div>
  ),
};
```

### Task 3: Install shadcn Button component

Run `npx shadcn@latest add button` in `tina-web/`.

Creates `src/components/ui/button.tsx` with size and variant props via CVA.

**Files created:**
- `tina-web/src/components/ui/button.tsx`

**Verification:** File exists, imports resolve.

### Task 4: Write Button stories

**File:** `tina-web/src/components/ui/button.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "./button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {
  args: { children: "Button" },
};

export const Secondary: Story = {
  args: { children: "Secondary", variant: "secondary" },
};

export const Destructive: Story = {
  args: { children: "Destructive", variant: "destructive" },
};

export const Outline: Story = {
  args: { children: "Outline", variant: "outline" },
};

export const Ghost: Story = {
  args: { children: "Ghost", variant: "ghost" },
};

export const Link: Story = {
  args: { children: "Link", variant: "link" },
};

export const Small: Story = {
  args: { children: "Small", size: "sm" },
};

export const Large: Story = {
  args: { children: "Large", size: "lg" },
};

export const Icon: Story = {
  args: { children: "C", size: "icon" },
};

export const AllVariants: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <Button>Default</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="destructive">Destructive</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="link">Link</Button>
    </div>
  ),
};

export const AllSizes: Story = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm">Small</Button>
      <Button size="default">Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon">C</Button>
    </div>
  ),
};
```

### Task 5: Install shadcn Card component

Run `npx shadcn@latest add card` in `tina-web/`.

Creates `src/components/ui/card.tsx` with CardHeader, CardTitle, CardDescription, CardContent, CardFooter subcomponents.

**Files created:**
- `tina-web/src/components/ui/card.tsx`

**Verification:** File exists, imports resolve.

### Task 6: Write Card stories

**File:** `tina-web/src/components/ui/card.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card";
import { Button } from "./button";

const meta: Meta<typeof Card> = {
  title: "Primitives/Card",
  component: Card,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Card>;

export const Default: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Card Title</CardTitle>
        <CardDescription>Card description text goes here.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>Card content with design token styling.</p>
      </CardContent>
      <CardFooter>
        <Button>Action</Button>
      </CardFooter>
    </Card>
  ),
};

export const HeaderOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardHeader>
        <CardTitle>Header Only</CardTitle>
        <CardDescription>A card with just a header.</CardDescription>
      </CardHeader>
    </Card>
  ),
};

export const ContentOnly: Story = {
  render: () => (
    <Card className="w-[350px]">
      <CardContent className="pt-6">
        <p>A minimal card with only content.</p>
      </CardContent>
    </Card>
  ),
};
```

### Task 7: Install shadcn ScrollArea component

Run `npx shadcn@latest add scroll-area` in `tina-web/`.

This installs `@radix-ui/react-scroll-area` and creates `src/components/ui/scroll-area.tsx`.

**Files created:**
- `tina-web/src/components/ui/scroll-area.tsx`

**Verification:** File exists, imports resolve.

### Task 8: Write ScrollArea stories

**File:** `tina-web/src/components/ui/scroll-area.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { ScrollArea } from "./scroll-area";
import { Separator } from "./separator";

const meta: Meta<typeof ScrollArea> = {
  title: "Primitives/ScrollArea",
  component: ScrollArea,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof ScrollArea>;

const tags = Array.from({ length: 50 }).map((_, i) => `Item ${i + 1}`);

export const Vertical: Story = {
  render: () => (
    <ScrollArea className="h-72 w-48 rounded-md border border-border">
      <div className="p-4">
        <h4 className="mb-4 text-sm font-medium leading-none">Items</h4>
        {tags.map((tag) => (
          <div key={tag}>
            <div className="text-sm">{tag}</div>
            <Separator className="my-2" />
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-96 whitespace-nowrap rounded-md border border-border">
      <div className="flex w-max space-x-4 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="shrink-0 rounded-md border border-border bg-card p-4"
          >
            <span className="text-sm">Card {i + 1}</span>
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};
```

Note: This story imports Separator (Task 9). If tasks are executed sequentially (Task 7 then Task 9 then back to Task 8), adjust order. Alternatively, the Vertical story can use a simple `<div>` divider instead of the Separator component until Separator is installed. The executor should install Separator (Task 9) before writing ScrollArea stories if needed, or use a plain `<hr>` placeholder.

### Task 9: Install shadcn Separator component

Run `npx shadcn@latest add separator` in `tina-web/`.

Creates `src/components/ui/separator.tsx`.

**Files created:**
- `tina-web/src/components/ui/separator.tsx`

**Verification:** File exists, imports resolve.

### Task 10: Write Separator stories

**File:** `tina-web/src/components/ui/separator.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import { Separator } from "./separator";

const meta: Meta<typeof Separator> = {
  title: "Primitives/Separator",
  component: Separator,
  tags: ["autodocs"],
};

export default meta;
type Story = StoryObj<typeof Separator>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64">
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Section Title</h4>
        <p className="text-sm text-muted-foreground">A description below.</p>
      </div>
      <Separator className="my-4" />
      <div className="space-y-1">
        <h4 className="text-sm font-medium leading-none">Another Section</h4>
        <p className="text-sm text-muted-foreground">More content here.</p>
      </div>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-5 items-center space-x-4 text-sm">
      <span>Item A</span>
      <Separator orientation="vertical" />
      <span>Item B</span>
      <Separator orientation="vertical" />
      <span>Item C</span>
    </div>
  ),
};
```

### Task 11: Install shadcn Tooltip component

Run `npx shadcn@latest add tooltip` in `tina-web/`.

This installs `@radix-ui/react-tooltip` and creates `src/components/ui/tooltip.tsx`.

**Files created:**
- `tina-web/src/components/ui/tooltip.tsx`

**Verification:** File exists, imports resolve.

### Task 12: Write Tooltip stories

**File:** `tina-web/src/components/ui/tooltip.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./tooltip";
import { Button } from "./button";

const meta: Meta<typeof Tooltip> = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

export const Default: Story = {
  render: () => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>Tooltip content</p>
      </TooltipContent>
    </Tooltip>
  ),
};

export const WithSideOptions: Story = {
  render: () => (
    <div className="flex gap-8">
      {(["top", "right", "bottom", "left"] as const).map((side) => (
        <Tooltip key={side}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm">
              {side}
            </Button>
          </TooltipTrigger>
          <TooltipContent side={side}>
            <p>Tooltip on {side}</p>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  ),
};
```

### Task 13: Verify everything works

1. `cd tina-web && npm run build` -- existing app still builds
2. `cd tina-web && npx tsc --noEmit` -- no TypeScript errors
3. `cd tina-web && npm run storybook` -- Storybook launches, all primitive stories render with dark theme
4. Each primitive component uses design tokens (dark backgrounds, sky-blue primary, correct typography)

## Execution Order

Tasks 1-2 (Badge), 3-4 (Button), and 9-10 (Separator) have no dependencies on each other and can be done in any order. Task 5-6 (Card) depends on Button being available for the footer story. Tasks 7-8 (ScrollArea) depend on Separator for the vertical scroll story. Task 11-12 (Tooltip) depends on Button for the trigger.

Recommended sequential order:
```
Task 1  (install Badge)
Task 2  (Badge stories)
Task 3  (install Button)
Task 4  (Button stories)
Task 9  (install Separator)
Task 10 (Separator stories)
Task 5  (install Card)
Task 6  (Card stories)
Task 7  (install ScrollArea)
Task 8  (ScrollArea stories)
Task 11 (install Tooltip)
Task 12 (Tooltip stories)
Task 13 (verify)
```

## Files Created

| File | Purpose |
|------|---------|
| `tina-web/src/components/ui/badge.tsx` | shadcn Badge primitive |
| `tina-web/src/components/ui/badge.stories.tsx` | Badge stories |
| `tina-web/src/components/ui/button.tsx` | shadcn Button primitive |
| `tina-web/src/components/ui/button.stories.tsx` | Button stories |
| `tina-web/src/components/ui/card.tsx` | shadcn Card primitive |
| `tina-web/src/components/ui/card.stories.tsx` | Card stories |
| `tina-web/src/components/ui/scroll-area.tsx` | shadcn ScrollArea primitive |
| `tina-web/src/components/ui/scroll-area.stories.tsx` | ScrollArea stories |
| `tina-web/src/components/ui/separator.tsx` | shadcn Separator primitive |
| `tina-web/src/components/ui/separator.stories.tsx` | Separator stories |
| `tina-web/src/components/ui/tooltip.tsx` | shadcn Tooltip primitive |
| `tina-web/src/components/ui/tooltip.stories.tsx` | Tooltip stories |

## Files Modified

| File | Change |
|------|--------|
| `tina-web/package.json` | New dependencies added by `npx shadcn add` (radix-ui packages) |
| `tina-web/package-lock.json` | Lock file updated |

## What NOT To Do

- Do NOT modify any existing components in `src/components/`
- Do NOT create domain components (StatusBadge, TaskCard, etc.) -- that is Phase 3
- Do NOT modify `src/index.css`, `tailwind.config.ts`, or Storybook config files -- Phase 1 set those up correctly
- Do NOT add extra shadcn components beyond the six listed (Badge, Button, Card, ScrollArea, Separator, Tooltip)
- Do NOT manually create `src/components/ui/` files -- use `npx shadcn@latest add` to generate them, which ensures they match the `components.json` configuration
- Do NOT fetch data in stories -- all stories use static mock data
