import math

import pytest

from ml import inference
from ml.features import RAW_COLUMNS

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
        ("race", 3, "RIDRETH3", "Non-Hispanic White"),
        ("race", 3.0, "RIDRETH3", "Non-Hispanic White"),
        ("race", 5, "RIDRETH3", None),
        ("education", 5, "DMDEDUC2", "College graduate or above"),
        ("education", 9, "DMDEDUC2", None),
        ("moderate_activity_units", 2, "PAD790U", "W"),
        ("moderate_activity_units", "m", "PAD790U", "M"),
        ("moderate_activity_units", 7, "PAD790U", None),
        ("smoker", "yes", "SMQ020", "Yes"),
        ("smoker", "No", "SMQ020", "No"),
        ("smoker", None, "SMQ020", None),
        ("smoker", "", "SMQ020", None),
        ("high_bp", "true", "BPQ020", "Yes"),
        ("high_chol", "2", "BPQ080", "No"),
        ("bp_med", "false", "BPQ101D", "No"),
        ("chol_med", "1", "RXQ033", "Yes"),
        ("diabetic", "borderline", "DIQ010", "Borderline"),
        ("diabetic", "yes", "DIQ010", "Yes"),
        ("diabetic", "no", "DIQ010", "No"),
    ],
)
def test_mapping(key, value, column, expected):
    result = inference.build_raw_row({key: value}, None)[column]
    if expected is None:
        assert _nan(result)
    else:
        assert result == expected


@pytest.mark.parametrize(
    "sex,expected", [("male", "Male"), ("Female", "Female"), ("other", None), (None, None)]
)
def test_sex(sex, expected):
    result = inference.build_raw_row({}, sex)["RIAGENDR"]
    assert _nan(result) if expected is None else result == expected


def test_numeric_mapping_and_missing():
    row = inference.build_raw_row({"sbp": "140", "hgb": None, "age": 55}, None)
    assert row["BPXOSY1"] == 140.0
    assert row["RIDAGEYR"] == 55.0
    assert _nan(row["LBXHGB"])


def test_missing_inputs_in_raw_column_order():
    row = inference.build_raw_row({"age": 50, "sbp": 120}, "male")
    missing = inference.missing_inputs(row)
    assert "RIDAGEYR" not in missing and "BPXOSY1" not in missing and "RIAGENDR" not in missing
    assert missing == [column for column in RAW_COLUMNS if column in missing]
    assert "LBXHGB" in missing


def test_get_model_is_cached():
    assert inference.get_model() is inference.get_model()


def test_predict_probability_in_unit_interval():
    probability = inference.predict_probability(inference.build_raw_row({"age": 60}, "male"))
    assert 0.0 <= probability <= 1.0
