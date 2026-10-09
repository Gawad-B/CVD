import { describe, expect, it } from "vitest";
import { formatScore } from "./formatScore";

describe("formatScore", () => {
  it("shows whole-number percentages and never rounds a real risk to 0%", () => {
    expect(formatScore(0.00289)).toBe("<1%");
    expect(formatScore(0)).toBe("0%");
    expect(formatScore(0.114)).toBe("11%");
    expect(formatScore(0.66)).toBe("66%");
  });
});
