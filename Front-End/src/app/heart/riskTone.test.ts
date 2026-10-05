import { describe, expect, it } from "vitest";
import * as tone from "./riskTone";
import { RISK_TONE, heartRateDisplay } from "./riskTone";

describe("RISK_TONE", () => {
  it("matches the design table", () => {
    expect(RISK_TONE.low).toMatchObject({ color: "#16a34a", ecg: "#4ade80", bpm: 68 });
    expect(RISK_TONE.medium).toMatchObject({ color: "#d97706", ecg: "#fbbf24", bpm: 91 });
    expect(RISK_TONE.high).toMatchObject({ color: "#dc2626", ecg: "#f87171", bpm: 118 });
    expect(RISK_TONE.low.state).toBe("Low estimated risk. Routine follow-up in 12 months.");
  });
  it("state text makes no rhythm or beat claims", () => {
    for (const r of Object.values(RISK_TONE)) expect(r.state).not.toMatch(/beat|rhythm|irregular|regular/i);
    expect(RISK_TONE.medium.state).toBe("Moderate estimated risk. Review within 3 months.");
    expect(RISK_TONE.high.state).toBe("High estimated risk. Prompt clinical review recommended.");
  });
  it("exposes no rhythm-as-finding text", () => {
    expect(JSON.stringify(tone)).not.toMatch(/Irregular, low output|Occasional ectopy|Regular sinus/);
  });
});

describe("heartRateDisplay", () => {
  it("uses the measured rate when provided", () => {
    expect(heartRateDisplay(72, "high")).toEqual({ bpm: 72, measured: true });
  });
  it("falls back to the illustrative rate", () => {
    expect(heartRateDisplay(null, "medium")).toEqual({ bpm: 91, measured: false });
    expect(heartRateDisplay(undefined, "low")).toEqual({ bpm: 68, measured: false });
  });
  it("treats non-finite or out-of-range values as not measured", () => {
    expect(heartRateDisplay(0, "low")).toEqual({ bpm: 68, measured: false });
    expect(heartRateDisplay(NaN, "high")).toEqual({ bpm: 118, measured: false });
    expect(heartRateDisplay(250, "medium")).toEqual({ bpm: 91, measured: false });
    expect(heartRateDisplay(29, "low").measured).toBe(false);
    expect(heartRateDisplay(30, "low").measured).toBe(true);
    expect(heartRateDisplay(220, "low").measured).toBe(true);
  });
});
