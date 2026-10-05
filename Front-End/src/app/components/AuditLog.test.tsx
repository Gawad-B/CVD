import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditLogEntry } from "../api/types";

const api = vi.hoisted(() => ({ getAuditLogEntries: vi.fn() }));
vi.mock("../api/client", () => api);

import { AuditLog } from "./AuditLog";

const entry = (id: number, over: Partial<AuditLogEntry> = {}): AuditLogEntry => ({
  auditLogId: id,
  actorUsername: "dr.lee",
  actionType: "read",
  resourceType: "patient",
  resourceId: id,
  patientId: id,
  outcome: "success",
  endpoint: "/api/patients",
  ipAddress: "",
  createdAt: "2026-10-01T09:30:00Z",
  ...over,
});

const page = (from: number, n: number) => Array.from({ length: n }, (_, i) => entry(from + i));

describe("AuditLog", () => {
  beforeEach(() => {
    api.getAuditLogEntries.mockReset();
  });

  it("renders README columns with uppercase action and outcome badge", async () => {
    api.getAuditLogEntries.mockResolvedValue([entry(1, { actionType: "login", outcome: "denied", resourceType: "auth", resourceId: 0, patientId: undefined })]);
    render(<AuditLog />);
    const row = (await screen.findByText("dr.lee")).closest("tr")!;
    expect(within(row).getByText("login")).toHaveClass("uppercase");
    expect(within(row).getByText("denied")).toHaveAttribute("data-variant", "denied");
    expect(within(row).queryByText(/Patient #/)).not.toBeInTheDocument();
    expect(api.getAuditLogEntries).toHaveBeenCalledWith(undefined, { limit: 50, offset: 0 });
  });

  it("filters by outcome through the API", async () => {
    api.getAuditLogEntries.mockResolvedValue([entry(1)]);
    const u = userEvent.setup();
    render(<AuditLog />);
    await screen.findByText("dr.lee");
    api.getAuditLogEntries.mockResolvedValue([entry(7, { outcome: "denied", actorUsername: "mallory" })]);
    await u.click(screen.getByRole("button", { name: "Denied" }));
    expect(api.getAuditLogEntries).toHaveBeenLastCalledWith("denied", { limit: 50, offset: 0 });
    expect(await screen.findByText("mallory")).toBeInTheDocument();
    expect(screen.queryByText("dr.lee")).not.toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Failure" }));
    expect(api.getAuditLogEntries).toHaveBeenLastCalledWith("failure", { limit: 50, offset: 0 });
  });

  it("drops rows already shown when pages overlap", async () => {
    api.getAuditLogEntries.mockResolvedValueOnce(page(1, 50)).mockResolvedValueOnce([...page(49, 2), ...page(51, 1)]);
    const u = userEvent.setup();
    render(<AuditLog />);
    await u.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(1 + 51));
  });

  it("loads more with an offset and hides the button after a short page", async () => {
    api.getAuditLogEntries.mockResolvedValueOnce(page(1, 50)).mockResolvedValueOnce(page(51, 3));
    const u = userEvent.setup();
    render(<AuditLog />);
    const more = await screen.findByRole("button", { name: "Load more" });
    await u.click(more);
    expect(api.getAuditLogEntries).toHaveBeenLastCalledWith(undefined, { limit: 50, offset: 50 });
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(1 + 53));
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });
});
