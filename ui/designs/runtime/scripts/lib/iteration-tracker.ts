import fs from "node:fs";
import { dirname } from "node:path";
import type {
  ConvergenceReport,
  IterationRecord,
} from "../../src/compare/types.ts";

const CONVERGENCE_THRESHOLD = 1.0; // diffPercentage below this = pixel match

export class IterationTracker {
  private report: ConvergenceReport;
  private reportPath: string;

  constructor(
    reportPath: string,
    designSlug: string,
    variationSlug: string,
    storyId: string,
  ) {
    this.reportPath = reportPath;

    if (fs.existsSync(reportPath)) {
      this.report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
    } else {
      this.report = {
        designSlug,
        variationSlug,
        storyId,
        iterations: [],
        converged: false,
        totalIterations: 0,
        finalDiffPercentage: 100,
        startedAt: new Date().toISOString(),
        completedAt: "",
      };
    }
  }

  record(
    pixelDiff: { diffPercentage: number; diffPixels: number; totalPixels: number },
    visionResult: { pass: boolean; confidence: number; issueCount: number } | null,
  ): void {
    const iteration: IterationRecord = {
      iteration: this.report.iterations.length + 1,
      timestamp: new Date().toISOString(),
      pixelDiff,
      visionResult,
    };

    this.report.iterations.push(iteration);
    this.report.totalIterations = this.report.iterations.length;
    this.report.finalDiffPercentage = pixelDiff.diffPercentage;

    const pixelPass = pixelDiff.diffPercentage < CONVERGENCE_THRESHOLD;
    const visionPass = visionResult === null || visionResult.pass;
    this.report.converged = pixelPass && visionPass;

    if (this.report.converged) {
      this.report.completedAt = new Date().toISOString();
    }

    this.persist();
  }

  getReport(): ConvergenceReport {
    return { ...this.report };
  }

  private persist(): void {
    fs.mkdirSync(dirname(this.reportPath), { recursive: true });
    fs.writeFileSync(this.reportPath, JSON.stringify(this.report, null, 2));
  }
}
