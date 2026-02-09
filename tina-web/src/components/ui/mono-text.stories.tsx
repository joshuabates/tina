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
