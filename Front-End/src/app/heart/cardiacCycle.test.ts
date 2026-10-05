import { describe, expect, it } from "vitest";
import { beatPeriod, clampBpm, normalizeRisk, cardiacCycle, riskParams, smoothstep } from "./cardiacCycle";

describe("smoothstep", () => {
  it("clamps and eases", () => {
    expect(smoothstep(0, 1, -1)).toBe(0);
    expect(smoothstep(0, 1, 2)).toBe(1);
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5);
  });
});

describe("cardiacCycle", () => {
  it("starts and ends at rest", () => {
    expect(cardiacCycle(0)).toBeCloseTo(0, 6);
    expect(cardiacCycle(1)).toBeCloseTo(0, 6);
  });
  it("peaks near 1 around the end of systole", () => {
    for (const p of [0.26, 0.3, 0.34]) expect(cardiacCycle(p)).toBeGreaterThan(0.99);
    expect(cardiacCycle(0.3)).toBeLessThanOrEqual(1.0001);
  });
  it("has a small atrial kick before systole", () => {
    const kick = cardiacCycle(0.07);
    expect(kick).toBeGreaterThan(0.1);
    expect(kick).toBeLessThan(0.2);
  });
  it("relaxes slowly after systole", () => {
    expect(cardiacCycle(0.46)).toBeGreaterThan(0.3);
    expect(cardiacCycle(0.46)).toBeLessThan(0.7);
    expect(cardiacCycle(0.6)).toBeCloseTo(0, 6);
  });
});

describe("riskParams", () => {
  it("low", () => {
    expect(riskParams("low")).toEqual({ depth: 1, tint: 0, target: 0xffffff, droop: 0, spin: 0.22 });
  });
  it("medium", () => {
    expect(riskParams("medium")).toEqual({ depth: 0.6, tint: 0.55, target: 0x5a2622, droop: 0.03, spin: 0.16 });
  });
  it("high", () => {
    expect(riskParams("high")).toEqual({ depth: 0.3, tint: 0.78, target: 0xa9a4b8, droop: 0.08, spin: 0.1 });
  });
  it("unknown is a neutral grey", () => {
    expect(riskParams("unknown").target).toBe(0x9aa3b5);
  });
  it("never depicts rhythm: no jitter or ectopic in any level", () => {
    for (const r of ["low", "medium", "high", "unknown"] as const) {
      expect(riskParams(r)).not.toHaveProperty("jitter");
      expect(riskParams(r)).not.toHaveProperty("ectopic");
    }
  });
});

describe("beatPeriod", () => {
  it("is 60/bpm", () => {
    expect(beatPeriod(60)).toBe(1);
    expect(beatPeriod(120)).toBe(0.5);
  });
});

describe("normalizeRisk / clampBpm", () => {
  it("maps unrecognised risk to unknown (never low)", () => {
    expect(normalizeRisk("bogus")).toBe("unknown");
    expect(normalizeRisk("high")).toBe("high");
    expect(riskParams("bogus" as never)).toEqual(riskParams("unknown"));
  });
  it("clamps bpm to 30-220", () => {
    expect(clampBpm(0)).toBe(30);
    expect(clampBpm(500)).toBe(220);
    expect(clampBpm(72)).toBe(72);
    expect(Number.isFinite(clampBpm(NaN))).toBe(true);
  });
});
