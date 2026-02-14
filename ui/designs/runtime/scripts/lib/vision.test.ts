import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VisionResult } from "../../src/compare/types.ts";

// Mock the Anthropic SDK before importing vision module
const mockCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: mockCreate };
  },
}));

// Mock fs for image reading
const mockReadFileSync = vi.fn().mockReturnValue(Buffer.from("fake-png-data"));
vi.mock("node:fs", () => ({
  default: {
    readFileSync: mockReadFileSync,
  },
  readFileSync: mockReadFileSync,
}));

describe("compareWithVision", () => {
  let compareWithVision: typeof import("./vision.ts").compareWithVision;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import("./vision.ts");
    compareWithVision = mod.compareWithVision;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns passing result when images match", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: true,
            confidence: 0.95,
            issues: [],
            summary: "The implementation closely matches the design.",
          }),
        },
      ],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.issues).toHaveLength(0);
    expect(mockCreate).toHaveBeenCalledOnce();
  });

  it("returns failing result with issues when images differ", async () => {
    mockCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            pass: false,
            confidence: 0.85,
            issues: [
              {
                category: "spacing",
                severity: "major",
                description: "Button padding is 8px in design but 16px in implementation",
                region: "center",
              },
            ],
            summary: "Spacing differences detected in button area.",
          }),
        },
      ],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].category).toBe("spacing");
  });

  it("handles API errors gracefully", async () => {
    mockCreate.mockRejectedValue(new Error("API key invalid"));

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.summary).toContain("Vision comparison failed");
  });

  it("handles malformed API response", async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: "text", text: "not valid json" }],
    });

    const result = await compareWithVision("/path/design.png", "/path/storybook.png");

    expect(result.pass).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.summary).toContain("Failed to parse");
  });
});
