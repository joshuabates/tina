import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import type { VisionResult } from "../../src/compare/types.ts";

const VISION_PROMPT = `You are comparing a design mockup against a Storybook implementation screenshot.

Analyze both images and provide a structured JSON assessment. Compare:
- **Layout**: Element positioning, alignment, flow direction
- **Spacing**: Padding, margins, gaps between elements
- **Typography**: Font size, weight, line height, letter spacing
- **Color**: Background colors, text colors, border colors, shadows
- **States**: Interactive states, hover effects, focus indicators (if visible)

Respond with ONLY a JSON object (no markdown, no code fences):

{
  "pass": boolean (true if implementation is visually acceptable match),
  "confidence": number (0-1, how confident you are in your assessment),
  "issues": [
    {
      "category": "layout" | "spacing" | "typography" | "color" | "states" | "other",
      "severity": "minor" | "major" | "critical",
      "description": "specific description of the difference",
      "region": "where in the image (e.g. 'top-left', 'header', 'button area')"
    }
  ],
  "summary": "one-sentence overall assessment"
}

Rules:
- "pass" should be true only if there are no major or critical issues
- Minor issues (e.g. 1px alignment, slight color shade) can still pass
- Be specific about pixel values, colors, and measurements when possible
- "confidence" reflects how clearly you can assess the comparison`;

export async function compareWithVision(
  designPath: string,
  storybookPath: string,
  model: string = "claude-sonnet-4-5-20250929",
): Promise<VisionResult> {
  try {
    const designData = fs.readFileSync(designPath);
    const storybookData = fs.readFileSync(storybookPath);

    const client = new Anthropic();
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Design mockup (reference):" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: designData.toString("base64"),
              },
            },
            { type: "text", text: "Storybook implementation (actual):" },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: storybookData.toString("base64"),
              },
            },
            { type: "text", text: VISION_PROMPT },
          ],
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return errorResult("No text response from vision model");
    }

    const parsed = JSON.parse(textBlock.text) as VisionResult;
    return {
      pass: Boolean(parsed.pass),
      confidence: Number(parsed.confidence) || 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: String(parsed.summary || ""),
    };
  } catch (err) {
    if (err instanceof SyntaxError) {
      return errorResult("Failed to parse vision model response as JSON");
    }
    return errorResult(
      `Vision comparison failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function errorResult(message: string): VisionResult {
  return { pass: false, confidence: 0, issues: [], summary: message };
}
