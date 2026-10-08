import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { mapAlerts } from "../api/client";
import { ClinicalAlerts } from "./ClinicalAlerts";

const ALERTS = [
  { code: "smoker", severity: "info" as const, title: "Smoker", detail: "Current or former smoker." },
  { code: "bp_crisis", severity: "critical" as const, title: "Hypertensive crisis range", detail: "190/110 mmHg" },
];

describe("ClinicalAlerts", () => {
  it("lists alerts most severe first and explains a raised risk level", () => {
    render(<ClinicalAlerts alerts={ALERTS} baseRiskLevel="low" riskSource="model" riskLevel="high" />);
    const items = within(screen.getByRole("list", { name: "Clinical alerts" })).getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("Critical: Hypertensive crisis range — 190/110 mmHg");
    expect(items[1]).toHaveTextContent("Smoker");
    expect(screen.getByRole("note")).toHaveTextContent("Risk raised from low (model) to high by clinical alerts");
  });

  it("omits the raised note when the model level stands, and renders nothing without alerts", () => {
    const { container, rerender } = render(<ClinicalAlerts alerts={ALERTS} baseRiskLevel="high" riskLevel="high" />);
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    rerender(<ClinicalAlerts alerts={[]} baseRiskLevel="low" riskLevel="low" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("sanitizes alerts from the API", () => {
    expect(mapAlerts([{ code: "x", severity: "bogus", title: "T" }, null, { code: "y" }])).toEqual([
      { code: "x", severity: "info", title: "T", detail: "" },
    ]);
    expect(mapAlerts(undefined)).toEqual([]);
  });
});
