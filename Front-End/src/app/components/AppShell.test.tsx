import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "../api/types";

const auth = vi.hoisted(() => ({ user: null as unknown, logout: vi.fn() }));
const api = vi.hoisted(() => ({
  getRiskAssessments: vi.fn(),
  getDashboardStats: vi.fn(),
}));

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: auth.user, logout: auth.logout, isAuthenticated: true }),
}));
vi.mock("../api/client", () => api);

import { AppShell } from "./AppShell";
import { shellTabsForRole } from "./shellTabs";

function userWithRole(role: User["role"], extra: Partial<User> = {}): User {
  return { userId: 1, username: `${role}1`, email: "x@y.z", fullName: "", role, ...extra };
}

function renderShell(user: User) {
  auth.user = user;
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/dashboard" element={<p>dashboard page</p>} />
        </Route>
      </Routes>
    </MemoryRouter>
  );
}

function tabNames() {
  const nav = screen.getByRole("navigation", { name: "Main" });
  return within(nav)
    .getAllByRole("link")
    .map((a) => a.textContent);
}

beforeEach(() => {
  auth.logout.mockReset();
  api.getRiskAssessments.mockResolvedValue([]);
  api.getDashboardStats.mockResolvedValue({ pendingReview: 0 });
});

describe("AppShell tab filtering", () => {
  it.each([
    ["admin", ["Dashboard", "Patients", "Assessments", "Models", "Users", "Audit log"]],
    ["doctor", ["Dashboard", "Patients", "Assessments", "Models"]],
    ["clinician", ["Dashboard", "Patients", "Assessments"]],
    ["auditor", ["Dashboard", "Assessments", "Audit log"]],
  ] as const)("shows the right tabs for %s", async (role, expected) => {
    renderShell(userWithRole(role));
    expect(tabNames()).toEqual(expected);
    expect(shellTabsForRole(role).map((t) => t.label)).toEqual(expected);
    await waitFor(() => expect(api.getRiskAssessments).toHaveBeenCalled());
  });

  it("hides every tab without a user", () => {
    expect(shellTabsForRole(undefined)).toEqual([]);
  });
});

describe("AppShell bell and menu", () => {
  it("shows the pending count dot and links dropdown items to the dashboard", async () => {
    api.getRiskAssessments.mockResolvedValue([
      { assessmentId: 7, patientName: "Ada Lovelace", probabilityCvd: 0.42, effectiveRiskLevel: "medium", createdAt: "2026-10-01T10:00:00Z" },
    ]);
    api.getDashboardStats.mockResolvedValue({ pendingReview: 3 });
    renderShell(userWithRole("doctor"));
    const bell = await screen.findByRole("button", { name: /3 pending review/ });
    expect(screen.getByTestId("bell-dot")).toBeInTheDocument();
    await userEvent.click(bell);
    const link = await screen.findByRole("link", { name: /Ada Lovelace/ });
    expect(link).toHaveAttribute("href", "/dashboard?assessment=7");
    expect(api.getRiskAssessments).toHaveBeenCalledWith({ reviewStatus: "pending", limit: 10 });
  });

  it("shows no dot when nothing is pending", async () => {
    renderShell(userWithRole("doctor"));
    await screen.findByRole("button", { name: /nothing pending/ });
    expect(screen.queryByTestId("bell-dot")).not.toBeInTheDocument();
  });

  it("shows demo expiry and logs out from the avatar menu", async () => {
    renderShell(userWithRole("doctor", { username: "demo-abc123", isDemo: true, demoExpiresAt: "2026-10-19T12:00:00Z" }));
    await userEvent.click(screen.getByRole("button", { name: /Account menu/ }));
    expect(screen.getByText("demo-abc123")).toBeInTheDocument();
    expect(screen.getByText(/Demo · expires/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(auth.logout).toHaveBeenCalledTimes(1);
  });

  it("returns focus to the trigger when Escape closes a menu", async () => {
    renderShell(userWithRole("doctor"));
    const trigger = screen.getByRole("button", { name: /Account menu/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "true");
    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await userEvent.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });
});
