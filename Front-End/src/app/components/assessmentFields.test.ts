import { describe, expect, it } from "vitest";
import { MORE_FIELDS, REQUIRED_FIELDS, buildAssessmentPayload, initialValues, validateAssessment } from "./assessmentFields";

function filled() {
  return {
    ...initialValues(),
    bmi: "27.5",
    waistCm: "98",
    systolicBp: "128",
    diastolicBp: "82",
    highBp: "no",
    bpMed: "no",
    totalCholesterol: "190",
    hdl: "52",
    hba1cPercent: "5.6",
    hsCrp: "1.8",
    wbc: "6.6",
    hemoglobin: "14",
    platelets: "240",
    rdw: "13.5",
    incomeRatio: "2.5",
    smoker: "no",
  };
}

const REQUIRED = [
  "bmi", "bpMed", "diastolicBp", "hba1cPercent", "hdl", "hemoglobin", "highBp", "hsCrp", "incomeRatio",
  "platelets", "rdw", "smoker", "systolicBp", "totalCholesterol", "waistCm", "wbc",
];

describe("assessment fields", () => {
  it("requires the top-importance inputs and a derivable age", () => {
    const errors = validateAssessment(initialValues(), null);
    expect(Object.keys(errors).sort()).toEqual(["age", ...REQUIRED].sort());
    expect(REQUIRED_FIELDS.map((f) => f.name).sort()).toEqual(REQUIRED);
  });

  it("asks for an explicit choice on required yes/no inputs", () => {
    const errors = validateAssessment({ ...filled(), bpMed: "", highBp: "", smoker: "" }, 50);
    expect(errors.bpMed).toBe("Choose Yes/No.");
    expect(errors.highBp).toBe("Choose Yes/No.");
    expect(errors.smoker).toBe("Choose Yes/No.");
  });

  it("keeps the low-importance inputs optional", () => {
    const optional = MORE_FIELDS.map((f) => f.name);
    for (const name of ["diabetic", "highChol", "cholMed", "sodium", "race", "education"]) {
      expect(optional).toContain(name);
    }
    expect(validateAssessment(filled(), 50)).toEqual({});
  });

  it("enforces the existing ranges and BP ordering", () => {
    const errors = validateAssessment({ ...filled(), systolicBp: "300", hba1cPercent: "25" }, 50);
    expect(errors.systolicBp).toMatch(/between 60 and 260/);
    expect(errors.hba1cPercent).toMatch(/between 3 and 20/);
    expect(validateAssessment({ ...filled(), systolicBp: "80", diastolicBp: "90" }, 50).diastolicBp).toMatch(/greater than/);
    expect(validateAssessment({ ...filled(), diastolicBp: "200" }, 50).diastolicBp).toMatch(/between 30 and 160/);
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
      age: 50,
      bmi: 27.5,
      waistCm: 98,
      systolicBp: 128,
      diastolicBp: 82,
      highBp: "no",
      bpMed: "no",
      totalCholesterol: 190,
      hdl: 52,
      hba1cPercent: 5.6,
      hsCrp: 1.8,
      wbc: 6.6,
      hemoglobin: 14,
      platelets: 240,
      rdw: 13.5,
      incomeRatio: 2.5,
      smoker: "no",
    });
    const withOptional = buildAssessmentPayload({ ...filled(), heartRate: "72", diabetic: "borderline", race: "3" }, 50);
    expect(withOptional.heartRate).toBe(72);
    expect(Number.isInteger(withOptional.heartRate)).toBe(true);
    expect(withOptional.diabetic).toBe("borderline");
    expect(withOptional.race).toBe(3);
  });
});
