"""PREVENT checked against published / reference-implementation values (preventr, PooledCohort)."""
import pytest

from ml import prevent

pytestmark = pytest.mark.nodb

# Supplement worked example: age 50, SBP 160 on BP meds, TC 200, HDL 45, no statin, diabetic,
# non-smoker, eGFR 90, BMI 35.
REF = dict(age=50, total_chol=200, hdl=45, sbp=160, diabetes=True, smoking=False, bmi=35, egfr=90,
           bp_tx=True, statin=False)


@pytest.mark.parametrize("sex,expected", [("female", 0.1468), ("male", 0.1632)])
def test_base_model_worked_example(sex, expected):
    result = prevent.ten_year_cvd(sex=sex, **REF)
    assert result["model"] == "base"
    assert result["risk"] == pytest.approx(expected, abs=5e-5)


@pytest.mark.parametrize("extra,model,female,male", [
    ({"uacr": 40}, "uacr", 0.1599, 0.1718),
    ({"hba1c": 7.5}, "hba1c", 0.1359, 0.1551),
    ({"uacr": 40, "hba1c": 7.5}, "full", 0.150, 0.162),  # SDI missing
])
def test_optional_models(extra, model, female, male):
    for sex, expected in (("female", female), ("male", male)):
        result = prevent.ten_year_cvd(sex=sex, **REF, **extra)
        assert result["model"] == model
        assert result["risk"] == pytest.approx(expected, abs=5e-4)


@pytest.mark.parametrize("changes,extra,female,male", [
    ({"age": 67}, {"hba1c": 9}, 0.266, 0.309),
    ({"age": 67, "statin": True}, {"uacr": 1000}, 0.353, 0.398),
    ({"age": 71, "statin": True}, {"hba1c": 9, "uacr": 1000}, 0.414, 0.478),
    ({"age": 71, "sbp": 145, "bp_tx": False}, {"hba1c": 6.7, "uacr": 10}, 0.163, 0.203),
])
def test_preventr_cases(changes, extra, female, male):
    for sex, expected in (("female", female), ("male", male)):
        result = prevent.ten_year_cvd(sex=sex, **{**REF, **changes}, **extra)
        assert result["risk"] == pytest.approx(expected, abs=5e-4)


def test_categories():
    assert [prevent.category(r) for r in (0.03, 0.06, 0.1, 0.25)] == ["low", "borderline", "intermediate", "high"]


def test_out_of_range_and_missing_inputs_are_unavailable():
    young = prevent.ten_year_cvd(sex="male", **{**REF, "age": 21})
    assert not young["available"] and "age 21" in young["reason"]
    crisis = prevent.ten_year_cvd(sex="male", **{**REF, "sbp": 190})
    assert not crisis["available"] and "systolic BP 190" in crisis["reason"]
    missing = prevent.ten_year_cvd(sex="male", **{**REF, "egfr": None})
    assert not missing["available"] and "eGFR" in missing["reason"]


def test_out_of_range_optional_inputs_fall_back_to_base():
    assert prevent.ten_year_cvd(sex="female", **REF, hba1c=20)["model"] == "base"


def test_risk_rises_with_bp_and_cholesterol():
    low = prevent.ten_year_cvd(sex="male", **{**REF, "sbp": 120, "total_chol": 170})["risk"]
    high = prevent.ten_year_cvd(sex="male", **{**REF, "sbp": 175, "total_chol": 300})["risk"]
    assert high > low


def test_age_outside_range_is_flagged():
    assert prevent.ten_year_cvd(sex="male", **{**REF, "age": 21})["ageOutOfRange"] is True
    assert "ageOutOfRange" not in prevent.ten_year_cvd(sex="male", **{**REF, "sbp": 190})


# 30-year values from preventr's tests (worked example and variants).
@pytest.mark.parametrize("changes,extra,female,male", [
    ({}, {}, 0.530, 0.514),
    ({}, {"hba1c": 9.2}, 0.541, 0.524),
    ({}, {"uacr": 92}, 0.565, 0.535),
    ({}, {"uacr": 40}, 0.542, 0.514),
    ({}, {"hba1c": 7.5}, 0.501, 0.491),
    ({"age": 35, "sbp": 145}, {"uacr": 10}, 0.325, 0.305),
])
def test_thirty_year_cases(changes, extra, female, male):
    for sex, expected in (("female", female), ("male", male)):
        assert prevent.thirty_year_cvd(sex=sex, **{**REF, **changes}, **extra)["risk"] == pytest.approx(expected, abs=5e-4)


def test_from_raw_adds_thirty_year_risk_only_for_ages_30_to_59():
    row = {"RIAGENDR": 1, "LBXTC": 200, "LBDHDD": 45, "BPXOSY1": 160, "DIQ010": 1, "SMQ020": 2, "BMXBMI": 35,
           "LBXSCR": 0.95, "BPQ150": 1, "BPQ101D": 2}
    young = prevent.from_raw({**row, "RIDAGEYR": 45})
    assert young["risk30"] > young["risk"] and young["model30"] == "base"
    assert "risk30" not in prevent.from_raw({**row, "RIDAGEYR": 65})
