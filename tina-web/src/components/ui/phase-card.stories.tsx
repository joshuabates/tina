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
