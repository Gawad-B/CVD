import math

import pytest

from ml import inference
from ml.nhanes import RAW_COLUMNS

pytestmark = pytest.mark.nodb


def _nan(value):
    return isinstance(value, float) and math.isnan(value)


def test_row_has_exactly_raw_columns_in_order():
    row = inference.build_raw_row({}, None)
    assert list(row) == RAW_COLUMNS
    assert all(_nan(value) for value in row.values())


@pytest.mark.parametrize(
    "key,value,column,expected",
    [
        ("race", 3, "RIDRETH3", 3.0),
        ("race", 5, "RIDRETH3", None),
        ("education", 5, "DMDEDUC2", 5.0),
        ("education", 9, "DMDEDUC2", None),
        ("general_health", 2, "HUQ010", 2.0),
        ("general_health", 6, "HUQ010", None),
        ("smoker", "yes", "SMQ020", 1.0),
        ("smoker", "No", "SMQ020", 2.0),
        ("smoker", None, "SMQ020", None),
        ("high_bp", "true", "BPQ020", 1.0),
        ("high_chol", "2", "BPQ080", 2.0),
        ("bp_med", "yes", "BPQ150", 1.0),        # BP medication is BPQ150 ...
        ("chol_med", "yes", "BPQ101D", 1.0),     # ... and cholesterol medication is BPQ101D
        ("smokes_now", "yes", "SMQ040", 1.0),
        ("smokes_now", "no", "SMQ040", 3.0),
        ("diabetic", "borderline", "DIQ010", 3.0),
        ("diabetic", "yes", "DIQ010", 1.0),
        ("diabetic", "no", "DIQ010", 2.0),
        ("creatinine", "0.9", "LBXSCR", 0.9),
        ("urine_acr", 30, "URDACT", 30.0),
    ],
)
def test_mapping(key, value, column, expected):
    result = inference.build_raw_row({key: value}, None)[column]
    assert _nan(result) if expected is None else result == expected


def test_skip_patterns_fill_implied_answers():
    row = inference.build_raw_row({"smoker": "no", "high_bp": "no"}, None)
    assert row["SMQ040"] == 3.0  # never-smoker does not smoke now
    assert row["BPQ150"] == 2.0  # never told high BP -> not on BP medication
    assert inference.build_raw_row({"high_bp": "no", "bp_med": "yes"}, None)["BPQ150"] == 1.0


@pytest.mark.parametrize("sex,expected", [("male", 1.0), ("Female", 2.0), ("other", None), (None, None)])
def test_sex(sex, expected):
    result = inference.build_raw_row({}, sex)["RIAGENDR"]
    assert _nan(result) if expected is None else result == expected


def test_display_value_decodes_codes():
    assert inference.display_value("BPQ150", 1.0) == "Yes"
    assert inference.display_value("RIAGENDR", 2.0) == "Female"
    assert inference.display_value("HUQ010", 4.0) == "Fair"
    assert inference.display_value("LBXTC", 210) == 210.0
    assert inference.display_value("LBXTC", float("nan")) is None


def test_missing_inputs_in_raw_column_order():
    row = inference.build_raw_row({"age": 50, "sbp": 120}, "male")
    missing = inference.missing_inputs(row)
    assert "RIDAGEYR" not in missing and "BPXOSY1" not in missing and "RIAGENDR" not in missing
    assert missing == [column for column in RAW_COLUMNS if column in missing]
    assert "LBXSCR" in missing


def test_get_model_is_cached():
    assert inference.get_model() is inference.get_model()


def test_predict_probability_in_unit_interval():
    probability = inference.predict_probability(inference.build_raw_row({"age": 60}, "male"))
    assert 0.0 <= probability <= 1.0


@pytest.mark.parametrize("key", inference.available_model_keys())
def test_ages_outside_training_data_score_as_the_nearest_trained_age(key):
    low, high = inference.MODELS[key]["age_range"]
    base = {"sbp": 130, "total_cholesterol": 200, "hdl": 50, "smoker": "no"}  # no creatinine: eGFR uses the real age
    score = lambda age: inference.predict_probability(inference.build_raw_row({**base, "age": age}, "male"), key)  # noqa: E731
    assert score(high + 10) == pytest.approx(score(high))
    assert score(18) == pytest.approx(score(low))


def test_every_model_describes_its_score():
    for key in inference.MODELS:
        description = inference.model_description(key)
        assert description["score_meaning"] and description["caveat"]
        assert description["age_min"] == 20
