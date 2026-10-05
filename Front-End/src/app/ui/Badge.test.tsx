import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BADGE_COLORS, Badge, riskVariant, type BadgeVariant } from "./Badge";

function colorsOf(el: HTMLElement) {
  return { bg: el.style.backgroundColor, fg: el.style.color };
}

describe("Badge", () => {
  it.each([
    ["low", "#dcfce7", "#15803d"],
    ["medium", "#fef3c7", "#b45309"],
    ["high", "#fee2e2", "#b91c1c"],
    ["pending", "#e8edf6", "#4b5568"],
    ["doctor", "#e6edff", "#1446d1"],
    ["clinician", "#dcfce7", "#15803d"],
    ["admin", "#e8edf6", "#323b4c"],
    ["auditor", "#fef3c7", "#b45309"],
    ["success", "#dcfce7", "#15803d"],
    ["denied", "#fee2e2", "#b91c1c"],
  ] as const)("%s uses the design colours", (variant, bg, fg) => {
    render(<Badge variant={variant}>label</Badge>);
    const el = screen.getByText("label");
    const probe = document.createElement("span");
    probe.style.backgroundColor = bg;
    probe.style.color = fg;
    expect(colorsOf(el)).toEqual(colorsOf(probe));
    expect(el).toHaveAttribute("data-variant", variant);
  });

  it("has default labels for the risk variants", () => {
    render(
      <>
        <Badge variant="low" />
        <Badge variant="medium" />
        <Badge variant="high" />
        <Badge variant="pending" />
      </>
    );
    expect(screen.getByText("Low risk")).toBeInTheDocument();
    expect(screen.getByText("Medium risk")).toBeInTheDocument();
    expect(screen.getByText("High risk")).toBeInTheDocument();
    expect(screen.getByText("Not assessed")).toBeInTheDocument();
  });

  it("defines a colour pair for every variant", () => {
    const variants = Object.keys(BADGE_COLORS) as BadgeVariant[];
    expect(variants.length).toBeGreaterThanOrEqual(12);
    for (const v of variants) expect(BADGE_COLORS[v]).toHaveLength(2);
  });

  it("maps unknown risk levels to pending", () => {
    expect(riskVariant("high")).toBe("high");
    expect(riskVariant(null)).toBe("pending");
    expect(riskVariant("weird")).toBe("pending");
  });
});

describe("unknown risk", () => {
  it("riskVariant maps unknown to a neutral badge labelled Unknown risk", () => {
    expect(riskVariant("unknown")).toBe("unknown");
    render(<Badge variant={riskVariant("unknown")} />);
    expect(screen.getByText("Unknown risk")).toBeInTheDocument();
  });
});
