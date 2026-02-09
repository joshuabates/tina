import type { Meta, StoryObj } from "@storybook/react";
import { StatPanel } from "./stat-panel";
import { MonoText } from "./mono-text";
import { Button } from "./button";

const meta: Meta<typeof StatPanel> = {
  title: "Domain/StatPanel",
  component: StatPanel,
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
type Story = StoryObj<typeof StatPanel>;

export const OrchestrationStatus: Story = {
  render: () => (
    <StatPanel title="Orchestration">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[8px] uppercase font-bold text-status-complete">EXECUTING</span>
        <MonoText className="text-[8px] text-muted-foreground">PHASE 3/5</MonoText>
      </div>
      <div className="w-full bg-muted h-1 rounded-full overflow-hidden">
        <div className="bg-primary w-3/5 h-full rounded-full" />
      </div>
      <div className="flex justify-end mt-1">
        <MonoText className="text-[8px] text-muted-foreground">ELAPSED: 46m</MonoText>
      </div>
    </StatPanel>
  ),
};

export const GitOperations: Story = {
  render: () => (
    <StatPanel title="Git Operations">
      <div className="space-y-3">
        <div>
          <span className="text-[7px] font-bold text-muted-foreground uppercase block mb-1">Recent Commits</span>
          <div className="space-y-1">
            <div className="flex gap-2 text-2xs group cursor-pointer">
              <MonoText className="text-primary/70">b92ae13</MonoText>
              <span className="truncate opacity-80 group-hover:opacity-100">add queue ingestion worker</span>
            </div>
            <div className="flex gap-2 text-2xs group cursor-pointer">
              <MonoText className="text-primary/70">4e332f1</MonoText>
              <span className="truncate opacity-80 group-hover:opacity-100">expose queue states</span>
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-border/50">
          <span className="text-[7px] font-bold text-muted-foreground uppercase block mb-1">Diff Summary</span>
          <div className="flex items-center justify-between text-xs">
            <MonoText>14 files</MonoText>
            <span className="flex gap-2">
              <MonoText className="text-status-complete">+382</MonoText>
              <MonoText className="text-status-blocked">-96</MonoText>
            </span>
          </div>
        </div>
      </div>
    </StatPanel>
  ),
};

export const PhaseReview: Story = {
  render: () => (
    <StatPanel title="Phase Review">
      <p className="text-xs leading-tight opacity-70 mb-2">
        System awaiting acknowledgment of P3 parameters before transition to P4.
      </p>
      <Button
        variant="outline"
        className="w-full text-2xs font-bold uppercase bg-primary/10 border-primary/20 text-primary hover:bg-primary/20"
      >
        Review and Approve
      </Button>
    </StatPanel>
  ),
};
