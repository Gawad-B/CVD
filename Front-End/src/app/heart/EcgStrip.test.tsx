import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EcgStrip, ecgPath, ecgScrollSeconds } from "./EcgStrip";

describe("EcgStrip", () => {
  it("is labelled as an illustration, never lead II", () => {
    render(<EcgStrip risk="low" bpm={68} />);
    expect(screen.getByText("ECG · illustration")).toBeInTheDocument();
    expect(screen.queryByText(/lead II/i)).toBeNull();
  });
  it("keeps duration finite for bad bpm and unknown risk", () => {
    expect(ecgScrollSeconds("low", 0)).toBeCloseTo(10);
    expect(Number.isFinite(ecgScrollSeconds("low", NaN))).toBe(true);
    expect(ecgScrollSeconds("bogus" as never, 60)).toBe(5);
  });
  it("derives scroll duration so beat spacing matches bpm", () => {
    expect(ecgScrollSeconds("low", 60)).toBe(5); // 5 beats per cycle, 1 s each
    expect(ecgScrollSeconds("low", 68)).toBeCloseTo((5 * 60) / 68);
    expect(ecgScrollSeconds("high", 120)).toBeCloseTo(2.5); // 5 beats at 0.5 s, same for every level
    render(<EcgStrip risk="medium" bpm={91} />);
    expect(screen.getByTestId("ecg-strip").dataset.scrollSeconds).toBe(((5 * 60) / 91).toFixed(3));
  });
  it("draws the same regular trace shape for every risk level (only amplitude differs)", () => {
    const xs = (d: string) => d.slice(1).split(" L").map((p) => p.split(" ")[0]);
    const low = ecgPath("low");
    for (const r of ["medium", "high", "unknown"] as const) {
      expect(xs(ecgPath(r))).toEqual(xs(low));
    }
    // same point count => no extra f-waves or ST excursions at higher risk
    expect(ecgPath("high").split(" L").length).toBe(low.split(" L").length);
  });
  it("beats are evenly spaced (regular rhythm) in every level", () => {
    for (const r of ["low", "medium", "high", "unknown"] as const) {
      const pts = ecgPath(r).slice(1).split(" L").map((p) => p.split(" ").map(Number));
      // R-peak = the minimum y per beat; peaks must be 120 units apart
      const peaks = pts.filter(([x, y]) => (x - 50) % 120 === 0 && y < 50).map(([x]) => x);
      expect(peaks.slice(0, 5)).toEqual([50, 170, 290, 410, 530]);
    }
  });
});
