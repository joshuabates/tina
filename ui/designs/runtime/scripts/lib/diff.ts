import fs from "node:fs";
import { dirname } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import type {
  ComparisonReport,
  DiffMetrics,
  GridCell,
  ChannelDiff,
} from "../../src/compare/types.ts";

export async function compareImages(
  designPath: string,
  storybookPath: string,
  diffOutputPath: string,
): Promise<DiffMetrics> {
  const designImg = readPNG(designPath);
  const storybookImg = readPNG(storybookPath);

  const width = Math.max(designImg.width, storybookImg.width);
  const height = Math.max(designImg.height, storybookImg.height);

  const designData = normalizeImage(designImg, width, height);
  const storybookData = normalizeImage(storybookImg, width, height);

  const diffPNG = new PNG({ width, height });
  const diffPixels = pixelmatch(
    designData,
    storybookData,
    diffPNG.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );

  const totalPixels = width * height;

  fs.mkdirSync(dirname(diffOutputPath), { recursive: true });
  fs.writeFileSync(diffOutputPath, PNG.sync.write(diffPNG));

  const grid = computeGrid(designData, storybookData, width, height, 3, 3);
  const channels = computeChannelDiff(designData, storybookData, width, height);

  return {
    totalPixels,
    diffPixels,
    diffPercentage: totalPixels > 0 ? (diffPixels / totalPixels) * 100 : 0,
    grid,
    channels,
  };
}

function readPNG(filePath: string): PNG {
  const data = fs.readFileSync(filePath);
  return PNG.sync.read(data);
}

function normalizeImage(
  img: PNG,
  targetWidth: number,
  targetHeight: number,
): Uint8Array {
  if (img.width === targetWidth && img.height === targetHeight) {
    return new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.length);
  }
  const normalized = new PNG({
    width: targetWidth,
    height: targetHeight,
    fill: true,
  });
  for (let i = 0; i < normalized.data.length; i += 4) {
    normalized.data[i] = 255;
    normalized.data[i + 1] = 255;
    normalized.data[i + 2] = 255;
    normalized.data[i + 3] = 255;
  }
  PNG.bitblt(img, normalized, 0, 0, img.width, img.height, 0, 0);
  return new Uint8Array(
    normalized.data.buffer,
    normalized.data.byteOffset,
    normalized.data.length,
  );
}

function computeGrid(
  dataA: Uint8Array,
  dataB: Uint8Array,
  width: number,
  height: number,
  rows: number,
  cols: number,
): GridCell[] {
  const cells: GridCell[] = [];
  const cellWidth = Math.ceil(width / cols);
  const cellHeight = Math.ceil(height / rows);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * cellWidth;
      const y0 = row * cellHeight;
      const x1 = Math.min(x0 + cellWidth, width);
      const y1 = Math.min(y0 + cellHeight, height);

      let cellTotal = 0;
      let cellDiff = 0;

      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const idx = (y * width + x) * 4;
          cellTotal++;
          if (
            dataA[idx] !== dataB[idx] ||
            dataA[idx + 1] !== dataB[idx + 1] ||
            dataA[idx + 2] !== dataB[idx + 2] ||
            dataA[idx + 3] !== dataB[idx + 3]
          ) {
            cellDiff++;
          }
        }
      }

      cells.push({
        row,
        col,
        totalPixels: cellTotal,
        diffPixels: cellDiff,
        diffPercentage: cellTotal > 0 ? (cellDiff / cellTotal) * 100 : 0,
      });
    }
  }

  return cells;
}

function computeChannelDiff(
  dataA: Uint8Array,
  dataB: Uint8Array,
  width: number,
  height: number,
): ChannelDiff {
  let rDiff = 0;
  let gDiff = 0;
  let bDiff = 0;
  const totalPixels = width * height;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    rDiff += Math.abs(dataA[idx] - dataB[idx]);
    gDiff += Math.abs(dataA[idx + 1] - dataB[idx + 1]);
    bDiff += Math.abs(dataA[idx + 2] - dataB[idx + 2]);
  }

  const maxChannelDiff = totalPixels * 255;
  return {
    r: maxChannelDiff > 0 ? (rDiff / maxChannelDiff) * 100 : 0,
    g: maxChannelDiff > 0 ? (gDiff / maxChannelDiff) * 100 : 0,
    b: maxChannelDiff > 0 ? (bDiff / maxChannelDiff) * 100 : 0,
  };
}

export function writeReport(
  reportPath: string,
  designSlug: string,
  variationSlug: string,
  preset: string,
  metrics: DiffMetrics,
): void {
  const report: ComparisonReport = {
    designSlug,
    variationSlug,
    preset,
    timestamp: new Date().toISOString(),
    metrics,
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}
