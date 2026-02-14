import { describe, it, expect } from 'vitest';
import type {
  VisionIssueCategory,
  VisionIssueSeverity,
  VisionIssue,
  VisionResult,
  IterationRecord,
  ConvergenceReport,
} from './types';

describe('Vision Comparison Types', () => {
  it('should support VisionIssueCategory type', () => {
    const categories: VisionIssueCategory[] = [
      'layout',
      'spacing',
      'typography',
      'color',
      'states',
      'other',
    ];
    expect(categories).toHaveLength(6);
  });

  it('should support VisionIssueSeverity type', () => {
    const severities: VisionIssueSeverity[] = ['minor', 'major', 'critical'];
    expect(severities).toHaveLength(3);
  });

  it('should support VisionIssue interface', () => {
    const issue: VisionIssue = {
      category: 'layout',
      severity: 'major',
      description: 'Layout misalignment detected',
      region: 'header',
    };
    expect(issue.category).toBe('layout');
    expect(issue.severity).toBe('major');
  });

  it('should support VisionResult interface', () => {
    const result: VisionResult = {
      pass: true,
      confidence: 0.95,
      issues: [],
      summary: 'Design matches specification',
    };
    expect(result.pass).toBe(true);
    expect(result.confidence).toBe(0.95);
  });

  it('should support IterationRecord interface', () => {
    const record: IterationRecord = {
      iteration: 1,
      timestamp: '2026-02-14T08:44:40.696Z',
      pixelDiff: {
        diffPercentage: 2.5,
        diffPixels: 1000,
        totalPixels: 40000,
      },
      visionResult: {
        pass: false,
        confidence: 0.88,
        issueCount: 2,
      },
    };
    expect(record.iteration).toBe(1);
    expect(record.pixelDiff.diffPercentage).toBe(2.5);
  });

  it('should support IterationRecord with null visionResult', () => {
    const record: IterationRecord = {
      iteration: 2,
      timestamp: '2026-02-14T09:00:00.000Z',
      pixelDiff: {
        diffPercentage: 1.2,
        diffPixels: 480,
        totalPixels: 40000,
      },
      visionResult: null,
    };
    expect(record.visionResult).toBeNull();
  });

  it('should support ConvergenceReport interface', () => {
    const report: ConvergenceReport = {
      designSlug: 'homepage',
      variationSlug: 'dark-mode',
      storyId: 'story-123',
      iterations: [],
      converged: true,
      totalIterations: 5,
      finalDiffPercentage: 0.8,
      startedAt: '2026-02-14T08:00:00.000Z',
      completedAt: '2026-02-14T09:00:00.000Z',
    };
    expect(report.converged).toBe(true);
    expect(report.finalDiffPercentage).toBe(0.8);
  });
});
