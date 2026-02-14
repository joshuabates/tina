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

describe("vision + iteration tracker integration", () => {
  it("tracks convergence across iterations with pixel diff and vision", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    // Iteration 1: far from target
    tracker.record(
      { diffPercentage: 35.2, diffPixels: 3520, totalPixels: 10000 },
      { pass: false, confidence: 0.7, issueCount: 5 },
    );

    let report = tracker.getReport();
    expect(report.converged).toBe(false);
    expect(report.totalIterations).toBe(1);

    // Iteration 2: getting closer
    tracker.record(
      { diffPercentage: 8.1, diffPixels: 810, totalPixels: 10000 },
      { pass: false, confidence: 0.8, issueCount: 2 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(false);
    expect(report.totalIterations).toBe(2);

    // Iteration 3: pixel passes but vision fails
    tracker.record(
      { diffPercentage: 0.8, diffPixels: 80, totalPixels: 10000 },
      { pass: false, confidence: 0.85, issueCount: 1 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(false);

    // Iteration 4: both pass
    tracker.record(
      { diffPercentage: 0.3, diffPixels: 30, totalPixels: 10000 },
      { pass: true, confidence: 0.95, issueCount: 0 },
    );

    report = tracker.getReport();
    expect(report.converged).toBe(true);
    expect(report.totalIterations).toBe(4);
    expect(report.finalDiffPercentage).toBe(0.3);
    expect(report.completedAt).not.toBe("");

    // Verify decreasing trend
    const diffs = report.iterations.map((i) => i.pixelDiff.diffPercentage);
    for (let i = 1; i < diffs.length; i++) {
      expect(diffs[i]).toBeLessThan(diffs[i - 1]);
    }
  });

  it("handles vision-only iterations (no vision result)", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "integration-test-"));
    const reportPath = path.join(tmpDir, "convergence.json");
    const tracker = new IterationTracker(reportPath, "my-design", "v1", "story--default");

    // No vision result (e.g. ANTHROPIC_API_KEY not set)
    tracker.record(
      { diffPercentage: 0.5, diffPixels: 50, totalPixels: 10000 },
      null,
    );

    const report = tracker.getReport();
    expect(report.converged).toBe(true);
    expect(report.iterations[0].visionResult).toBeNull();
  });
});
