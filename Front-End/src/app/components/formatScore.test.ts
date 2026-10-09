import { describe, expect, it } from "vitest";
import { formatScore, levelReason } from "./formatScore";

describe("formatScore", () => {
  it("shows whole-number percentages and never rounds a real risk to 0%", () => {
    expect(formatScore(0.00289)).toBe("<1%");
    expect(formatScore(0)).toBe("0%");
    expect(formatScore(0.114)).toBe("11%");
    expect(formatScore(0.66)).toBe("66%");
  });
});

describe("levelReason", () => {
  it("names what set the level", () => {
    expect(levelReason({ probabilityCvd: 0.004, levelSource: "alerts" })).toBe("Clinical alerts");
    expect(levelReason({ probabilityCvd: 0.004, levelSource: "prevent", preventRisk: 0.114 })).toBe("PREVENT 11%");
    expect(levelReason({ probabilityCvd: 0.25, levelSource: "model" })).toBe("Model 25%");
    expect(levelReason({ probabilityCvd: 0.25 })).toBe("Model 25%");
    expect(levelReason({ probabilityCvd: 0.25, levelSource: "alerts", overrideRiskLevel: "low" })).toBe("Clinician override");
  });
});
