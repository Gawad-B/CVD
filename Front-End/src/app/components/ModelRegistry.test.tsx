import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Model } from "../api/types";

const api = vi.hoisted(() => ({ getModels: vi.fn(), activateModel: vi.fn() }));
vi.mock("../api/client", () => api);
const auth = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: auth.role ? { role: auth.role } : null }) }));

import { ModelRegistry } from "./ModelRegistry";

const model = (over: Partial<Model> = {}): Model => ({
  modelId: 1,
  modelName: "CVD NHANES Logistic",
  modelVersion: "4.1.0",
  algorithm: "logistic_regression",
  useCase: "cvd",
  isActive: true,
  status: "active",
  description: "Doctor-diagnosed CVD",
  scoreMeaning: "probability of already-diagnosed CVD",
  auc: 0.8606,
  aucCi95: [0.829, 0.89],
  accuracy: 0.667,
  precision: 0.26,
  recall: 0.902,
  f1Score: 0.4,
  specificity: 0.633,
  npv: 0.978,
  prAuc: 0.489,
  nTest: 1066,
  trainedAt: "2026-10-08T00:00:00Z",
  ...over,
});

const mortality = model({
  modelId: 2,
  modelName: "CVD 10-year Mortality Logistic",
  modelVersion: "1.0.0",
  isActive: false,
  status: "available",
  scoreMeaning: "10-year probability of cardiovascular death",
  trainedAt: "2026-10-09T00:00:00Z",
});

describe("ModelRegistry", () => {
  beforeEach(() => {
    api.getModels.mockReset();
    api.activateModel.mockReset();
    auth.role = "admin";
  });

  it("shows the active model first with its metrics, score meaning and status", async () => {
    api.getModels.mockResolvedValue([model({ modelId: 3, modelVersion: "3.0.0", isActive: false, status: "retired" }), mortality, model()]);
    render(<ModelRegistry />);
    const cards = await screen.findAllByTestId("model-card");
    const [active, available, retired] = cards;
    expect(active).toHaveAttribute("data-active", "true");
    expect(within(active).getByText("Active")).toBeInTheDocument();
    expect(within(active).getByText("v4.1.0 · trained 8 Oct 2026")).toBeInTheDocument();
    expect(within(active).getByText("0.861")).toBeInTheDocument();
    expect(within(active).getByText("90.2%")).toBeInTheDocument();
    expect(within(active).getByText("26%")).toBeInTheDocument();
    expect(within(active).getByText(/AUC 95% CI 0.829–0.890 · held-out test set of 1,066 people/)).toBeInTheDocument();
    expect(within(active).getByRole("button", { name: "Scoring new encounters" })).toBeDisabled();
    expect(within(available).getByText("Score: 10-year probability of cardiovascular death.")).toBeInTheDocument();
    expect(within(available).getByText("Available")).toBeInTheDocument();
    expect(within(retired).getByText("Retired")).toBeInTheDocument();
    expect(within(retired).queryByRole("button")).not.toBeInTheDocument();
  });

  it("lets an admin switch the active model after confirming", async () => {
    api.getModels.mockResolvedValueOnce([model(), mortality]).mockResolvedValueOnce([
      model({ isActive: false, status: "available" }),
      { ...mortality, isActive: true, status: "active" },
    ]);
    api.activateModel.mockResolvedValue(undefined);
    render(<ModelRegistry />);
    await userEvent.click(await screen.findByRole("button", { name: "Use this model" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("New assessments will be scored by CVD 10-year Mortality Logistic v1.0.0");
    await userEvent.click(within(dialog).getByRole("button", { name: "Use this model" }));
    await waitFor(() => expect(api.activateModel).toHaveBeenCalledWith(2));
    await waitFor(() => expect(api.getModels).toHaveBeenCalledTimes(2));
    const [first] = await screen.findAllByTestId("model-card");
    await waitFor(() => expect(within(first).getByText("CVD 10-year Mortality Logistic")).toBeInTheDocument());
  });

  it("does not offer switching to doctors", async () => {
    auth.role = "doctor";
    api.getModels.mockResolvedValue([model(), mortality]);
    render(<ModelRegistry />);
    await screen.findAllByTestId("model-card");
    expect(screen.queryByRole("button", { name: "Use this model" })).not.toBeInTheDocument();
  });

  it("shows a readable error when switching fails", async () => {
    api.getModels.mockResolvedValue([model(), mortality]);
    api.activateModel.mockRejectedValue(new Error("This model is not installed and cannot be activated"));
    render(<ModelRegistry />);
    await userEvent.click(await screen.findByRole("button", { name: "Use this model" }));
    await userEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Use this model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not installed");
  });

  it("shows an error with retry when the models cannot load", async () => {
    api.getModels.mockRejectedValue(new Error("down"));
    render(<ModelRegistry />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load models.");
  });
});
