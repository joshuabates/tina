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
