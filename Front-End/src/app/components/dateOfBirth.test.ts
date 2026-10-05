import { describe, expect, it } from "vitest";
import { ageFromDob, dobProblem, parseIsoDate, todayIso } from "./dateOfBirth";

const today = new Date(2026, 9, 4); // 4 Oct 2026, local

describe("dateOfBirth", () => {
  it("parses strict ISO dates without timezone shifts", () => {
    expect(parseIsoDate("1990-02-28")).toEqual({ y: 1990, m: 2, d: 28 });
    expect(parseIsoDate("1990-02-30")).toBeNull();
    expect(parseIsoDate("1990-2-3")).toBeNull();
    expect(parseIsoDate("")).toBeNull();
  });

  it("computes whole-year age, counting birthdays", () => {
    expect(ageFromDob("1990-10-04", today)).toBe(36);
    expect(ageFromDob("1990-10-05", today)).toBe(35);
    expect(ageFromDob("1990-01-01", today)).toBe(36);
    expect(ageFromDob("2027-01-01", today)).toBeNull();
    expect(ageFromDob("garbage", today)).toBeNull();
  });

  it("formats today as a local ISO date", () => {
    expect(todayIso(today)).toBe("2026-10-04");
  });

  it("accepts 18-120 and rejects everything else with a message", () => {
    expect(dobProblem("2008-10-04", today)).toBeNull(); // exactly 18
    expect(dobProblem("2008-10-05", today)).toMatch(/18–120/);
    expect(dobProblem("1906-10-04", today)).toBeNull(); // exactly 120
    expect(dobProblem("1906-10-03", today)).toBeNull(); // 120
    expect(dobProblem("1905-10-04", today)).toMatch(/18–120/); // 121
    expect(dobProblem("2030-01-01", today)).toMatch(/future/);
    expect(dobProblem("", today)).toMatch(/Enter/);
  });
});
