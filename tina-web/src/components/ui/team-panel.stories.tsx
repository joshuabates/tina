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
