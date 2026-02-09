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
