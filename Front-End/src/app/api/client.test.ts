import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asRiskLevel, getAuditLogEntries, getPatients, loginUser } from "./client";
import { setSessionExpiredHandler } from "./errors";

const expired = { detail: { code: "demo_expired", message: "Your demo has ended.", contactEmail: "a@b.co" } };

function mockFetch(status: number, body: unknown) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("fetchJson session expiry", () => {
  const handler = vi.fn();
  beforeEach(() => {
    handler.mockReset();
    setSessionExpiredHandler(handler);
  });
  afterEach(() => {
    setSessionExpiredHandler(null);
    localStorage.clear();
  });

  it("notifies on an authenticated request answered with demo_expired", async () => {
    localStorage.setItem("cardio_token", "t");
    mockFetch(403, expired);
    await expect(getPatients()).rejects.toMatchObject({ code: "demo_expired", contactEmail: "a@b.co" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0].message).toBe("Your demo has ended.");
  });

  it("does not notify for /api/auth/login (Login shows it itself)", async () => {
    localStorage.setItem("cardio_token", "stale");
    mockFetch(403, expired);
    await expect(loginUser("demo-x", "pw")).rejects.toMatchObject({ code: "demo_expired" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify without a token or for other 403s", async () => {
    mockFetch(403, expired);
    await expect(getPatients()).rejects.toBeTruthy();
    localStorage.setItem("cardio_token", "t");
    mockFetch(403, { detail: "Forbidden" });
    await expect(getPatients()).rejects.toBeTruthy();
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("getAuditLogEntries", () => {
  it("sends outcome, limit and offset as query params and maps endpoint", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          { audit_log_id: 1, actor_username: "a", action_type: "read", resource_type: "patient", resource_id: 3, patient_id: null, outcome: "denied", endpoint: "/api/patients/3", ip_address: "", created_at: "2026-10-01T00:00:00Z" },
        ]),
        { status: 200 }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const rows = await getAuditLogEntries("denied", { limit: 50, offset: 50 });
    const url = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(url).toContain("/api/audit-log?outcome=denied&limit=50&offset=50");
    expect(rows[0].endpoint).toBe("/api/patients/3");
    expect(rows[0].patientId).toBeUndefined();
  });
});

describe("asRiskLevel", () => {
  it("keeps known levels", () => {
    expect(asRiskLevel("low")).toBe("low");
    expect(asRiskLevel("medium")).toBe("medium");
    expect(asRiskLevel("high")).toBe("high");
  });
  it("never silently turns an unknown value into low", () => {
    expect(asRiskLevel("critical")).toBe("unknown");
    expect(asRiskLevel("critical", "low")).toBe("unknown");
    expect(asRiskLevel(undefined)).toBe("unknown");
    expect(asRiskLevel(42)).toBe("unknown");
  });
  it("uses the fallback only when the value is absent", () => {
    expect(asRiskLevel(undefined, "high")).toBe("high");
    expect(asRiskLevel(null, "medium")).toBe("medium");
  });
});
