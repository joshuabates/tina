import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { chromium, type Browser } from "playwright";

export interface CaptureOptions {
  url: string;
  outputPath: string;
  width: number;
  height: number;
  waitForSelector?: string;
  delay?: number;
}

let browser: Browser | null = null;

export async function ensureBrowser(): Promise<Browser> {
  if (!browser) {
    browser = await chromium.launch();
  }
  return browser;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export async function captureScreenshot(options: CaptureOptions): Promise<void> {
  const { url, outputPath, width, height, waitForSelector, delay } = options;
  const b = await ensureBrowser();
  const page = await b.newPage({ viewport: { width, height } });

  try {
    await page.goto(url, { waitUntil: "networkidle" });

    if (waitForSelector) {
      await page.waitForSelector(waitForSelector, { timeout: 10_000 });
    }

    if (delay) {
      await page.waitForTimeout(delay);
    }

    mkdirSync(dirname(outputPath), { recursive: true });
    await page.screenshot({ path: outputPath, fullPage: false });
  } finally {
    await page.close();
  }
}
