import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { IterationTracker } from "./iteration-tracker.ts";

let tmpDir = "";

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

describe("IterationTracker", () => {
  it("creates a new report on first record", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record({
      diffPercentage: 25.5,
      diffPixels: 2550,
      totalPixels: 10000,
    }, null);

    const report = tracker.getReport();
    expect(report.iterations).toHaveLength(1);
    expect(report.iterations[0].iteration).toBe(1);
    expect(report.iterations[0].pixelDiff.diffPercentage).toBe(25.5);
    expect(report.converged).toBe(false);
  });

  it("tracks multiple iterations and detects convergence", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 15, diffPixels: 1500, totalPixels: 10000 },
      { pass: false, confidence: 0.8, issueCount: 3 },
    );
    tracker.record(
      { diffPercentage: 5, diffPixels: 500, totalPixels: 10000 },
      { pass: false, confidence: 0.85, issueCount: 1 },
    );
    tracker.record(
      { diffPercentage: 0.5, diffPixels: 50, totalPixels: 10000 },
      { pass: true, confidence: 0.95, issueCount: 0 },
    );

    const report = tracker.getReport();
    expect(report.iterations).toHaveLength(3);
    expect(report.converged).toBe(true);
    expect(report.totalIterations).toBe(3);
    expect(report.finalDiffPercentage).toBe(0.5);
  });

  it("persists report to disk", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 10, diffPixels: 1000, totalPixels: 10000 },
      null,
    );

    expect(fs.existsSync(reportPath)).toBe(true);
    const saved = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    expect(saved.designSlug).toBe("my-design");
    expect(saved.iterations).toHaveLength(1);
  });

  it("resumes from existing report file", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");

    // First session
    const tracker1 = new IterationTracker(reportPath, "my-design", "v1", "story--default");
    tracker1.record(
      { diffPercentage: 20, diffPixels: 2000, totalPixels: 10000 },
      null,
    );

    // Second session resumes
    const tracker2 = new IterationTracker(reportPath, "my-design", "v1", "story--default");
    tracker2.record(
      { diffPercentage: 5, diffPixels: 500, totalPixels: 10000 },
      { pass: true, confidence: 0.9, issueCount: 0 },
    );

    const report = tracker2.getReport();
    expect(report.iterations).toHaveLength(2);
    expect(report.iterations[0].pixelDiff.diffPercentage).toBe(20);
    expect(report.iterations[1].pixelDiff.diffPercentage).toBe(5);
  });

  it("reports non-convergence when pixel diff stays high", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tracker-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    tracker.record(
      { diffPercentage: 20, diffPixels: 2000, totalPixels: 10000 },
      { pass: false, confidence: 0.7, issueCount: 5 },
    );

    const report = tracker.getReport();
    expect(report.converged).toBe(false);
  });
});
