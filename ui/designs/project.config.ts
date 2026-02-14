export interface StorybookConfig {
  enabled: boolean;
  cwd: string;
  devCommand: string;
  url: string;
  storyGlobs: string[];
}

export interface ScreenshotPreset {
  name: string;
  width: number;
  height: number;
}

export interface DesignsProjectConfig {
  projectName: string;
  setsRoot: string;
  screenshotDir: string;
  uiComponentGlobs: string[];
  tokenFiles: string[];
  viteAliases: Record<string, string>;
  styleEntrypoints?: string[];
  prebuild?: string;
  storybook: StorybookConfig;
  screenshotPresets: ScreenshotPreset[];
}

const config: DesignsProjectConfig = {
  projectName: "tina",
  setsRoot: "ui/designs/sets",
  screenshotDir: "ui/designs/.artifacts/screenshots",
  uiComponentGlobs: ["tina-web/src/components/ui/**/*.tsx"],
  tokenFiles: ["tina-web/src/styles/_tokens.scss", "tina-web/src/index.css"],
  viteAliases: {
    "@": "tina-web/src",
    "@convex": "convex/_generated",
  },
  styleEntrypoints: ["tina-web/src/index.css"],
  storybook: {
    enabled: true,
    cwd: "tina-web",
    devCommand: "npm run storybook -- --port 6006",
    url: "http://localhost:6006",
    storyGlobs: ["tina-web/src/**/*.stories.tsx", "tina-web/src/**/*.mdx"],
  },
  screenshotPresets: [
    { name: "desktop", width: 1440, height: 960 },
    { name: "laptop", width: 1280, height: 800 },
  ],
};

export default config;
