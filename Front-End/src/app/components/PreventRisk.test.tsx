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

describe("PreventRisk outside the validated age range", () => {
  it("lists the major risk factors instead of a number", () => {
    render(
      <PreventRisk
        prevent={{ available: false, ageOutOfRange: true, reason: "Outside the PREVENT validated range: age 21 (valid 30-79)." }}
        alerts={[
          { code: "bp_crisis", severity: "critical", title: "Hypertensive crisis range", detail: "" },
          { code: "smoker", severity: "info", title: "Smoker", detail: "" },
          { code: "obesity", severity: "info", title: "Obesity", detail: "" },
        ]}
      />,
    );
    expect(screen.getByText(/no validated equation for this age/)).toBeInTheDocument();
    expect(screen.getByText("2 major risk factors: Hypertensive crisis range, Smoker.")).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("says when no major risk factors are flagged", () => {
    render(<PreventRisk prevent={{ available: false, ageOutOfRange: true }} alerts={[]} />);
    expect(screen.getByText("No major risk factors flagged.")).toBeInTheDocument();
  });
});

describe("PreventRisk 30-year risk", () => {
  it("shows the 30-year risk for ages 30-59 when present", () => {
    render(<PreventRisk prevent={{ available: true, risk: 0.012, category: "low", model: "base", risk30: 0.143, model30: "base" }} />);
    expect(screen.getByText("30-year CVD risk: 14.3%")).toBeInTheDocument();
  });

  it("omits it when absent", () => {
    render(<PreventRisk prevent={{ available: true, risk: 0.2, category: "high", model: "base" }} />);
    expect(screen.queryByText(/30-year/)).not.toBeInTheDocument();
    expect(mapPrevent({ available: true, risk: 0.1, risk30: "0.3", model30: "uacr" })).toMatchObject({ risk30: 0.3, model30: "uacr" });
  });
});
