import { describe, expect, it } from "vitest";
import { formatScore } from "./formatScore";

describe("formatScore", () => {
  it("keeps small risks visible and rounds larger ones to one decimal", () => {
    expect(formatScore(0.00289)).toBe("0.29%");
    expect(formatScore(0)).toBe("0.00%");
    expect(formatScore(0.114)).toBe("11.4%");
    expect(formatScore(0.66)).toBe("66.0%");
  });
});
