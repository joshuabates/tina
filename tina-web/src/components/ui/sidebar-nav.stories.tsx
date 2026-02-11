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
        id: "p1",
        name: "tina-core",
        active: true,
        items: [
          { label: "Request handoff", statusText: "DONE", statusColor: "text-status-complete" },
          { label: "Core initialization", statusText: "DONE", statusColor: "text-status-complete" },
          { label: "Queue workers", statusText: "ACTIVE", statusColor: "text-status-warning" },
        ],
      },
      {
        id: "p2",
        name: "tina-plugin",
        items: [
          { label: "Build pipeline", statusText: "DONE", statusColor: "text-status-complete" },
        ],
      },
      {
        id: "p3",
        name: "tina-cli",
        items: [
          { label: "Parser logic", statusText: "BLOCK", statusColor: "text-status-blocked" },
        ],
      },
      {
        id: "p4",
        name: "shared-utils",
        items: [],
      },
    ],
  },
};
