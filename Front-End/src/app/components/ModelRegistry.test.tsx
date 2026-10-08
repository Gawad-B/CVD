import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "../api/types";

const api = vi.hoisted(() => ({ getModels: vi.fn() }));
vi.mock("../api/client", () => api);

import { ModelRegistry } from "./ModelRegistry";

const model = (over: Partial<Model> = {}): Model => ({
  modelId: 1,
  modelName: "CVD stacked pipeline",
  modelVersion: "2.4",
  algorithm: "stacked_ensemble",
  useCase: "cvd",
  isActive: true,
  auc: 0.8123,
  accuracy: 0.74,
  precision: 0.31,
  recall: 0.78,
  f1Score: 0.45,
  trainedAt: "2026-08-14T00:00:00Z",
  ...over,
});

describe("ModelRegistry", () => {
  beforeEach(() => {
    api.getModels.mockReset();
  });

  it("marks the active model, shows its metrics and has no Set-as-active action", async () => {
    api.getModels.mockResolvedValue([
      model({ modelId: 2, modelVersion: "1.0", isActive: false, trainedAt: "2026-01-02T00:00:00Z" }),
      model(),
    ]);
    render(<ModelRegistry />);
    const cards = await screen.findAllByTestId("model-card");
    expect(cards).toHaveLength(2);

    // Active first.
    const [active, retired] = cards;
    expect(active).toHaveAttribute("data-active", "true");
    expect(within(active).getByText("Active")).toBeInTheDocument();
    expect(within(active).getByText("v2.4 · trained 14 Aug 2026")).toBeInTheDocument();
    expect(within(active).getByText("0.812")).toBeInTheDocument();
    expect(within(active).getByText("78%")).toBeInTheDocument();
    expect(within(active).getByText("Stacked ensemble")).toBeInTheDocument();
    expect(within(active).getByRole("button", { name: "Scoring new encounters" })).toBeDisabled();

    expect(retired).not.toHaveAttribute("data-active");
    expect(within(retired).getByText("Retired")).toBeInTheDocument();
    expect(within(retired).queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/set as active/i)).not.toBeInTheDocument();
    expect(screen.getByText("Calibrated to NHANES 2021–2023 adults (existing diagnosed CVD); decision support only.")).toBeInTheDocument();
  });

  it("shows an error with retry when the models cannot load", async () => {
    api.getModels.mockRejectedValue(new Error("down"));
    render(<ModelRegistry />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load models.");
  });
});
