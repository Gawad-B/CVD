import { describe, expect, it } from "vitest";
import { ApiError, parseApiError } from "./errors";

describe("parseApiError", () => {
  it("handles a string detail", () => {
    const err = parseApiError(429, JSON.stringify({ detail: "Demo limit reached. Try again tomorrow." }));
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.message).toBe("Demo limit reached. Try again tomorrow.");
    expect(err.code).toBeUndefined();
  });

  it("flattens a 422 list detail into field errors", () => {
    const body = {
      detail: [
        { loc: ["body", "heartRate"], msg: "Input should be less than or equal to 220", type: "less_than_equal" },
        { loc: ["body", "bmi"], msg: "Value error, bmi is required", type: "value_error" },
      ],
    };
    const err = parseApiError(422, JSON.stringify(body));
    expect(err.fieldErrors).toEqual([
      { field: "heartRate", message: "Input should be less than or equal to 220" },
      { field: "bmi", message: "bmi is required" },
    ]);
    expect(err.message).toBe("heartRate: Input should be less than or equal to 220; bmi: bmi is required");
  });

  it("reads code, message and contactEmail from an object detail", () => {
    const body = {
      detail: { code: "demo_expired", message: "Your 15-day demo has ended.", contactEmail: "a@b.co" },
    };
    const err = parseApiError(403, JSON.stringify(body));
    expect(err.code).toBe("demo_expired");
    expect(err.contactEmail).toBe("a@b.co");
    expect(err.message).toBe("Your 15-day demo has ended.");
    expect(err.isDemoExpired).toBe(true);
  });

  it("does not treat other 403s or other codes as demo expiry", () => {
    expect(parseApiError(403, JSON.stringify({ detail: "Forbidden" })).isDemoExpired).toBe(false);
    expect(parseApiError(401, JSON.stringify({ detail: { code: "demo_expired", message: "x" } })).isDemoExpired).toBe(false);
  });

  it("falls back for empty, non-JSON and unrecognised bodies", () => {
    expect(parseApiError(500, "").message).toBe("Request failed: 500");
    expect(parseApiError(502, "Bad gateway").message).toBe("Bad gateway");
    expect(parseApiError(500, "{}").message).toBe("Request failed: 500");
    expect(parseApiError(400, JSON.stringify({ detail: { code: "x" } })).message).toBe("Request failed: 400");
    expect(parseApiError(500, "x".repeat(500)).message).toBe("Request failed: 500");
  });
});
