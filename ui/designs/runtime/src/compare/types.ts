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
