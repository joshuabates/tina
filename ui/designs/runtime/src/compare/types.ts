export interface CaptureOptions {
  url: string;
  outputPath: string;
  width: number;
  height: number;
  waitForSelector?: string;
  delay?: number;
}

export interface ComparisonReport {
  designSlug: string;
  variationSlug: string;
  preset: string;
  timestamp: string;
  metrics: DiffMetrics;
}

export interface DiffMetrics {
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
  grid: GridCell[];
  channels: ChannelDiff;
}

export interface GridCell {
  row: number;
  col: number;
  totalPixels: number;
  diffPixels: number;
  diffPercentage: number;
}

export interface ChannelDiff {
  r: number;
  g: number;
  b: number;
}

export interface ComparisonManifest {
  designSlug: string;
  variationSlug: string;
  storyId: string;
  presets: PresetResult[];
  capturedAt: string;
}

export interface PresetResult {
  name: string;
  width: number;
  height: number;
  hasDesign: boolean;
  hasStorybook: boolean;
  hasDiff: boolean;
  hasReport: boolean;
}

export type VisionIssueCategory =
  | "layout"
  | "spacing"
  | "typography"
  | "color"
  | "states"
  | "other";

export type VisionIssueSeverity = "minor" | "major" | "critical";

export interface VisionIssue {
  category: VisionIssueCategory;
  severity: VisionIssueSeverity;
  description: string;
  region?: string;
}

export interface VisionResult {
  pass: boolean;
  confidence: number;
  issues: VisionIssue[];
  summary: string;
}

export interface IterationRecord {
  iteration: number;
  timestamp: string;
  pixelDiff: {
    diffPercentage: number;
    diffPixels: number;
    totalPixels: number;
  };
  visionResult: {
    pass: boolean;
    confidence: number;
    issueCount: number;
  } | null;
}

export interface ConvergenceReport {
  designSlug: string;
  variationSlug: string;
  storyId: string;
  iterations: IterationRecord[];
  converged: boolean;
  totalIterations: number;
  finalDiffPercentage: number;
  startedAt: string;
  completedAt: string;
}
