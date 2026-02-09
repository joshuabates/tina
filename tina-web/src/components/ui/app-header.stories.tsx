import type { Meta, StoryObj } from "@storybook/react";
import { AppHeader } from "./app-header";

const meta: Meta<typeof AppHeader> = {
  title: "Domain/AppHeader",
  component: AppHeader,
  tags: ["autodocs"],
  parameters: { layout: "fullscreen" },
};

export default meta;
type Story = StoryObj<typeof AppHeader>;

export const Default: Story = {
  args: { version: "v2.4.12-stable" },
};

export const WithSearch: Story = {
  render: () => (
    <AppHeader version="v2.4.12-stable">
      <div className="relative flex items-center bg-muted/50 rounded px-2 py-0.5 w-64">
        <input
          className="bg-transparent border-none text-xs focus:ring-0 w-full p-0 text-foreground placeholder:text-muted-foreground"
          placeholder="Jump to..."
          type="text"
        />
      </div>
    </AppHeader>
  ),
};

export const CustomTitle: Story = {
  args: { title: "TINA", version: "v1.0.0" },
};
