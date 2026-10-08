import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mapPrevent } from "../api/client";
import { PreventRisk } from "./PreventRisk";

describe("PreventRisk", () => {
  it("shows the 10-year risk, category and equation", () => {
    render(<PreventRisk prevent={{ available: true, risk: 0.1668, category: "intermediate", model: "hba1c", egfr: 88.2 }} />);
    expect(screen.getByText("16.7%")).toBeInTheDocument();
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
    expect(screen.getByText("with HbA1c · eGFR 88.2")).toBeInTheDocument();
  });

  it("explains why PREVENT is unavailable", () => {
    render(<PreventRisk prevent={{ available: false, reason: "Outside the PREVENT validated range: age 21 (valid 30-79)." }} />);
    expect(screen.getByText(/not available/)).toBeInTheDocument();
    expect(screen.getByText(/age 21/)).toBeInTheDocument();
  });

  it("maps API results defensively", () => {
    expect(mapPrevent({ available: true, risk: "0.2", category: "high", model: "base", egfr: 70 })).toEqual({
      available: true, risk: 0.2, category: "high", model: "base", egfr: 70,
    });
    expect(mapPrevent({ available: true, risk: "x" })).toEqual({ available: false });
    expect(mapPrevent(null)).toBeUndefined();
  });
});
