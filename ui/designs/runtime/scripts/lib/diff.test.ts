import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { compareImages } from "./diff.ts";

function createSolidPNG(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): PNG {
  const png = new PNG({ width, height });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0];
    png.data[i + 1] = rgba[1];
    png.data[i + 2] = rgba[2];
    png.data[i + 3] = rgba[3];
  }
  return png;
}

function writePNG(filePath: string, png: PNG): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, PNG.sync.write(png));
}

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("compareImages", () => {
  it("reports zero diff for identical images", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    const img = createSolidPNG(10, 10, [255, 0, 0, 255]);
    writePNG(path.join(tmpDir, "a.png"), img);
    writePNG(path.join(tmpDir, "b.png"), img);

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.diffPixels).toBe(0);
    expect(result.diffPercentage).toBe(0);
    expect(result.totalPixels).toBe(100);
    expect(fs.existsSync(path.join(tmpDir, "diff.png"))).toBe(true);
  });

  it("reports full diff for completely different images", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    writePNG(path.join(tmpDir, "a.png"), createSolidPNG(10, 10, [255, 0, 0, 255]));
    writePNG(path.join(tmpDir, "b.png"), createSolidPNG(10, 10, [0, 0, 255, 255]));

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.diffPixels).toBe(100);
    expect(result.diffPercentage).toBe(100);
  });

  it("computes grid analysis with localized diffs", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    const img1 = createSolidPNG(9, 9, [255, 255, 255, 255]);
    const img2 = createSolidPNG(9, 9, [255, 255, 255, 255]);

    // Make top-left 3x3 region different
    for (let y = 0; y < 3; y++) {
      for (let x = 0; x < 3; x++) {
        const idx = (y * 9 + x) * 4;
        img2.data[idx] = 0;
      }
    }

    writePNG(path.join(tmpDir, "a.png"), img1);
    writePNG(path.join(tmpDir, "b.png"), img2);

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.grid).toHaveLength(9);
    const topLeft = result.grid.find((c) => c.row === 0 && c.col === 0);
    expect(topLeft!.diffPixels).toBeGreaterThan(0);
    const bottomRight = result.grid.find((c) => c.row === 2 && c.col === 2);
    expect(bottomRight!.diffPixels).toBe(0);
  });

  it("computes channel diffs correctly", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-test-"));
    writePNG(path.join(tmpDir, "a.png"), createSolidPNG(5, 5, [255, 0, 0, 255]));
    writePNG(path.join(tmpDir, "b.png"), createSolidPNG(5, 5, [0, 0, 0, 255]));

    const result = await compareImages(
      path.join(tmpDir, "a.png"),
      path.join(tmpDir, "b.png"),
      path.join(tmpDir, "diff.png"),
    );

    expect(result.channels.r).toBe(100);
    expect(result.channels.g).toBe(0);
    expect(result.channels.b).toBe(0);
  });
});
