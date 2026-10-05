import { describe, expect, it } from "vitest";
import { buildAssessmentPayload, initialValues, validateAssessment } from "./assessmentFields";

function filled() {
  return {
    ...initialValues(),
    bmi: "27.5",
    systolicBp: "128",
    diastolicBp: "82",
    totalCholesterol: "190",
    hdl: "52",
    smoker: "no",
    diabetic: "no",
  };
}

describe("assessment fields", () => {
  it("requires the compact inputs and a derivable age", () => {
    const errors = validateAssessment(initialValues(), null);
    expect(Object.keys(errors).sort()).toEqual(["age", "bmi", "diabetic", "diastolicBp", "hdl", "smoker", "systolicBp", "totalCholesterol"]);
  });

  it("requires an explicit smoker and diabetic choice (no silent default)", () => {
    expect(initialValues().smoker).toBe("");
    const errors = validateAssessment({ ...filled(), smoker: "", diabetic: "" }, 50);
    expect(errors.smoker).toBe("Choose Yes/No.");
    expect(errors.diabetic).toBe("Choose No/Borderline/Yes.");
  });

  it("enforces the existing ranges and BP ordering", () => {
    const errors = validateAssessment({ ...filled(), systolicBp: "300", hba1cPercent: "25" }, 50);
    expect(errors.systolicBp).toMatch(/between 60 and 260/);
    expect(errors.hba1cPercent).toMatch(/between 3 and 20/);
    expect(validateAssessment({ ...filled(), systolicBp: "80", diastolicBp: "90" }, 50).diastolicBp).toMatch(/greater than/);
  });

  it("validates heart rate as an integer 30-220 only when provided", () => {
    expect(validateAssessment(filled(), 50).heartRate).toBeUndefined();
    for (const bad of ["29", "221", "72.5", "abc"]) {
      expect(validateAssessment({ ...filled(), heartRate: bad }, 50).heartRate).toMatch(/whole number between 30 and 220/);
    }
    expect(validateAssessment({ ...filled(), heartRate: "72" }, 50).heartRate).toBeUndefined();
  });

  it("omits blank optional inputs and heartRate, and sends heartRate as an integer", () => {
    const payload = buildAssessmentPayload(filled(), 50);
    expect(payload).not.toHaveProperty("heartRate");
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      systolicBp: 128,
      diastolicBp: 82,
      totalCholesterol: 190,
      hdl: 52,
      bmi: 27.5,
      smoker: "no",
      diabetic: "no",
      age: 50,
    });
    const withBpm = buildAssessmentPayload({ ...filled(), heartRate: "72", highBp: "yes", race: "3" }, 50);
    expect(withBpm.heartRate).toBe(72);
    expect(Number.isInteger(withBpm.heartRate)).toBe(true);
    expect(withBpm.highBp).toBe("yes");
    expect(withBpm.race).toBe(3);
  });
});
