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
