import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RiskResult, inHundred, riskSummary } from "./RiskResult";

describe("RiskResult", () => {
  it("shows the screening model as a level with a meter and no percentage", () => {
    render(<RiskResult level="medium" scoreType="level" probability={0.42} />);
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Risk level: medium" })).toBeInTheDocument();
    expect(screen.queryByText("42%")).not.toBeInTheDocument();
  });

  it("shows the death model as a percentage and 'in 100' wording", () => {
    render(<RiskResult level="high" scoreType="death_10y" probability={0.07} />);
    expect(screen.getByText("7%")).toBeInTheDocument();
    expect(screen.getByText("About 7 in 100 people like this patient")).toBeInTheDocument();
  });

  it("words tiny risks without rounding them to zero", () => {
    expect(inHundred(0.004)).toBe("Fewer than 1 in 100");
    expect(inHundred(0.031)).toBe("About 3 in 100");
  });

  it("summarises what decided the level for lists", () => {
    expect(riskSummary({ probabilityCvd: 0.03, scoreType: "death_10y" })).toBe("3% death risk in 10 yrs");
    expect(riskSummary({ probabilityCvd: 0.4, levelSource: "alerts" })).toBe("Raised by clinical alerts");
    expect(riskSummary({ probabilityCvd: 0.4, levelSource: "prevent" })).toBe("From AHA PREVENT");
    expect(riskSummary({ probabilityCvd: 0.4 })).toBe("From screening model");
    expect(riskSummary({ probabilityCvd: 0.03, scoreType: "death_10y", overrideRiskLevel: "high" })).toBe("Set by clinician");
  });
});
