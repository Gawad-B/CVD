import { describe, expect, it } from "vitest";
import { MORE_FIELDS, REQUIRED_FIELDS, buildAssessmentPayload, initialValues, isShown, validateAssessment } from "./assessmentFields";

function filled() {
  return {
    ...initialValues(),
    bmi: "27.5",
    systolicBp: "128",
    diastolicBp: "82",
    highBp: "no",
    totalCholesterol: "190",
    hdl: "52",
    triglycerides: "140",
    highChol: "no",
    cholMed: "no",
    creatinine: "0.9",
    hba1cPercent: "5.6",
    diabetic: "no",
    smoker: "no",
    generalHealth: "2",
    heartRate: "72",
  };
}

// bpMed and smokesNow only apply when highBp / smoker are "yes"; urineAcr only for diabetics.
const ALWAYS_REQUIRED = [
  "bmi", "cholMed", "creatinine", "diabetic", "diastolicBp", "generalHealth", "hba1cPercent", "hdl",
  "highBp", "highChol", "smoker", "systolicBp", "totalCholesterol", "triglycerides",
];

describe("assessment fields", () => {
  it("requires the PREVENT and top model inputs and a derivable age", () => {
    const errors = validateAssessment(initialValues(), null);
    expect(Object.keys(errors).sort()).toEqual(["age", "heartRate", ...ALWAYS_REQUIRED].sort());
    expect(REQUIRED_FIELDS.map((f) => f.name).sort()).toEqual([...ALWAYS_REQUIRED, "bpMed", "smokesNow", "urineAcr"].sort());
  });

  it("requires urine albumin/creatinine for diabetics and keeps it optional otherwise", () => {
    expect(validateAssessment({ ...filled(), diabetic: "yes" }, 50).urineAcr).toBe("Required.");
    expect(validateAssessment({ ...filled(), diabetic: "borderline" }, 50).urineAcr).toBeUndefined();
    const optionalAcr = MORE_FIELDS.find((f) => f.name === "urineAcr")!;
    expect(isShown(optionalAcr, filled())).toBe(true);
    expect(isShown(optionalAcr, { ...filled(), diabetic: "yes" })).toBe(false);
  });

  it("asks about BP medication and current smoking only when they apply", () => {
    const bpMed = REQUIRED_FIELDS.find((f) => f.name === "bpMed")!;
    const smokesNow = REQUIRED_FIELDS.find((f) => f.name === "smokesNow")!;
    expect(isShown(bpMed, filled())).toBe(false);
    expect(isShown(smokesNow, filled())).toBe(false);
    const errors = validateAssessment({ ...filled(), highBp: "yes", smoker: "yes" }, 50);
    expect(errors.bpMed).toBe("Choose an option.");
    expect(errors.smokesNow).toBe("Choose an option.");
  });

  it("keeps the lower-weight inputs optional", () => {
    const optional = MORE_FIELDS.map((f) => f.name);
    for (const name of ["waistCm", "urineAcr", "glucose", "hsCrp", "sodium", "race", "education"]) {
      expect(optional).toContain(name);
    }
    expect(validateAssessment(filled(), 50)).toEqual({});
  });

  it("enforces the existing ranges and BP ordering", () => {
    const errors = validateAssessment({ ...filled(), systolicBp: "300", hba1cPercent: "25", creatinine: "40" }, 50);
    expect(errors.systolicBp).toMatch(/between 60 and 260/);
    expect(errors.hba1cPercent).toMatch(/between 3 and 20/);
    expect(errors.creatinine).toMatch(/between 0.2 and 15/);
    expect(validateAssessment({ ...filled(), systolicBp: "80", diastolicBp: "90" }, 50).diastolicBp).toMatch(/greater than/);
  });

  it("requires heart rate as an integer 30-220", () => {
    expect(validateAssessment({ ...filled(), heartRate: "" }, 50).heartRate).toBe("Required.");
    for (const bad of ["29", "221", "72.5", "abc"]) {
      expect(validateAssessment({ ...filled(), heartRate: bad }, 50).heartRate).toMatch(/whole number between 30 and 220/);
    }
    expect(validateAssessment({ ...filled(), heartRate: "72" }, 50).heartRate).toBeUndefined();
  });

  it("answers skipped questions, omits blank optional inputs, and sends heartRate as an integer", () => {
    const payload = buildAssessmentPayload(filled(), 50);
    expect(JSON.parse(JSON.stringify(payload))).toEqual({
      age: 50,
      bmi: 27.5,
      systolicBp: 128,
      diastolicBp: 82,
      highBp: "no",
      bpMed: "no",
      totalCholesterol: 190,
      hdl: 52,
      triglycerides: 140,
      highChol: "no",
      cholMed: "no",
      creatinine: 0.9,
      hba1cPercent: 5.6,
      diabetic: "no",
      smoker: "no",
      smokesNow: "no",
      generalHealth: 2,
      heartRate: 72,
    });
    const withOptional = buildAssessmentPayload(
      { ...filled(), heartRate: "72", highBp: "yes", bpMed: "yes", smoker: "yes", smokesNow: "yes", urineAcr: "40", race: "3" },
      50,
    );
    expect(withOptional.heartRate).toBe(72);
    expect(withOptional.bpMed).toBe("yes");
    expect(withOptional.smokesNow).toBe("yes");
    expect(withOptional.urineAcr).toBe(40);
    expect(withOptional.race).toBe(3);
  });
});
