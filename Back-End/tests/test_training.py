import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from ml import features
from ml.features import RAW_CATEGORICAL_COLUMNS, RAW_COLUMNS, RAW_NUMERIC_COLUMNS, SkewLog1p
from ml.train import main as train_main

pytestmark = [pytest.mark.slow, pytest.mark.nodb]

MODEL_DIR = Path(__file__).resolve().parent.parent / "model"


@pytest.fixture(scope="module")
def trained(tmp_path_factory):
    out = tmp_path_factory.mktemp("artifacts")
    metrics = train_main(MODEL_DIR / "traindata.csv", MODEL_DIR / "testdata.csv", out)
    return {"out": out, "metrics": metrics}


@pytest.fixture(scope="module")
def pipeline(trained):
    return joblib.load(trained["out"] / "cvd_pipeline.joblib")


@pytest.fixture(scope="module")
def test_x():
    return pd.read_csv(MODEL_DIR / "testdata.csv")[RAW_COLUMNS]


@pytest.fixture(scope="module")
def schema(trained):
    return json.loads((trained["out"] / "feature_schema.json").read_text())


def test_artifacts_and_schema_keys(trained, schema):
    out = trained["out"]
    assert (out / "cvd_pipeline.joblib").exists()
    assert (out / "metrics_ml.json").exists()
    for key in ("model_name", "model_version", "raw_columns", "numeric_columns",
                "categorical_columns", "categories", "reference_values", "labels",
                "decision_threshold"):
        assert key in schema
    assert schema["model_name"] == "CVD Stacked Pipeline"
    assert schema["model_version"] == "2.0.0"
    assert schema["raw_columns"] == RAW_COLUMNS
    assert schema["categories"]["SMQ020"] == ["No", "Yes"]
    assert schema["categories"]["RIAGENDR"] == ["Female", "Male"]
    assert set(schema["labels"]) == set(RAW_COLUMNS)
    assert set(schema["reference_values"]) == set(RAW_COLUMNS)


def test_metrics_keys(trained):
    metrics = json.loads((trained["out"] / "metrics_ml.json").read_text())
    for key in ("trained_at", "library_versions", "n_train", "n_test", "train_prevalence",
                "test_prevalence", "accuracy", "precision", "recall", "f1", "specificity",
                "accuracy_at_0_5", "auc", "auc_ci95", "pr_auc", "brier", "oof_auc",
                "calibration", "confusion_matrix", "note"):
        assert key in metrics
    assert metrics == json.loads(json.dumps(trained["metrics"]))


def test_metrics_sane(trained):
    m = trained["metrics"]
    assert m["auc"] > 0.80
    assert 0.10 <= m["decision_threshold"] <= 0.90
    assert m["auc_ci95"][0] < m["auc"] < m["auc_ci95"][1]


@pytest.mark.parametrize("column,low,high", [
    ("SMQ020", "No", "Yes"), ("RIAGENDR", "Male", "Female"), ("DIQ010", "No", "Yes"),
])
def test_categorical_sensitivity(pipeline, test_x, column, low, high):
    probs = []
    for value in (low, high):
        row = test_x.iloc[[0]].copy()
        row[column] = value
        probs.append(pipeline.predict_proba(row)[0, 1])
    assert probs[0] != probs[1]


def test_missing_tolerance(pipeline, test_x):
    row = test_x.iloc[[0]].copy()
    for col in RAW_NUMERIC_COLUMNS:
        if col != "RIDAGEYR":
            row[col] = np.nan
    p = pipeline.predict_proba(row)[0, 1]
    assert np.isfinite(p) and 0 < p < 1


def test_skew_columns_are_numeric():
    train = pd.read_csv(MODEL_DIR / "traindata.csv")[RAW_COLUMNS]
    prepared = features.FeatureEngineer().fit_transform(train)
    cols = SkewLog1p().fit(prepared).columns_
    assert cols
    assert all(pd.api.types.is_numeric_dtype(prepared[c]) for c in cols)


def test_reloaded_pipeline_reproduces_in_memory_metrics(trained, pipeline):
    """`pipeline` is loaded from disk; `trained["metrics"]` came from the in-memory fit."""
    from sklearn.metrics import confusion_matrix, roc_auc_score

    from ml.train import map_target

    test = pd.read_csv(MODEL_DIR / "testdata.csv")
    y = map_target(test["CVD_risk"]).to_numpy()
    prob = pipeline.predict_proba(test[RAW_COLUMNS])[:, 1]
    m = trained["metrics"]
    assert abs(roc_auc_score(y, prob) - m["auc"]) < 1e-12
    pred = (prob >= m["decision_threshold"]).astype(int)
    assert confusion_matrix(y, pred, labels=[0, 1]).tolist() == m["confusion_matrix"]
