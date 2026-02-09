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
