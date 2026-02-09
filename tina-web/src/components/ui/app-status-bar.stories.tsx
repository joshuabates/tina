import type { Meta, StoryObj } from "@storybook/react";
import { AppStatusBar } from "./app-status-bar";

const meta: Meta<typeof AppStatusBar> = {
  title: "Domain/AppStatusBar",
  component: AppStatusBar,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppStatusBar>;

export const Connected: Story = {
  args: {
    sessionDuration: "46m",
    projectName: "tina-core",
    phaseName: "P3 Execution",
    connected: true,
  },
};

export const Disconnected: Story = {
  args: { connected: false },
};

export const Minimal: Story = {
  args: { connected: true },
};
