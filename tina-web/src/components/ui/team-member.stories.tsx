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
