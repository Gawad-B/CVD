"""Reproducible training: OOF threshold on train only, test set touched once."""
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import lightgbm
import numpy as np
import pandas as pd
import sklearn
import xgboost
from sklearn.metrics import (accuracy_score, average_precision_score, brier_score_loss,
                             confusion_matrix, f1_score, precision_score, recall_score,
                             roc_auc_score)
from sklearn.model_selection import StratifiedKFold, cross_val_predict

from ml.features import (RAW_CATEGORICAL_COLUMNS, RAW_COLUMNS, RAW_NUMERIC_COLUMNS,
                         SEED, build_pipeline)

TARGET = "CVD_risk"
MODEL_NAME = "CVD Stacked Pipeline"
MODEL_VERSION = "2.0.0"
NOTE = ("Dataset is class-balanced (~50% prevalence); probabilities are not calibrated "
        "to clinical population prevalence.")

LABELS = {
    "SMQ020": "Smoker", "PAD790U": "Activity frequency unit", "DIQ010": "Diabetes",
    "RIAGENDR": "Sex", "RIDRETH3": "Race/ethnicity", "DMDEDUC2": "Education",
    "BPQ101D": "On BP medication", "BPQ020": "High blood pressure",
    "BPQ080": "High cholesterol", "RXQ033": "On cholesterol medication",
    "PAD810Q": "Vigorous activity sessions per unit", "PAD790Q": "Moderate activity sessions per unit",
    "PAD800": "Moderate activity minutes per session", "PAD680": "Sedentary minutes per day",
    "SLD012": "Sleep hours (weekday)", "SLD013": "Sleep hours (weekend)",
    "RIDAGEYR": "Age", "INDFMPIR": "Income-to-poverty ratio", "BMXBMI": "BMI",
    "BMXWAIST": "Waist (cm)", "BPXOSY1": "Systolic BP", "BPXODI1": "Diastolic BP",
    "LBXTC": "Total cholesterol", "LBDHDD": "HDL", "LBXGH": "HbA1c", "LBXHSCRP": "hs-CRP",
    "LBXSNASI": "Sodium", "LBXWBCSI": "WBC", "LBXHGB": "Hemoglobin",
    "LBXPLTSI": "Platelets", "LBXRDW": "RDW",
}


def map_target(y):
    return (y.astype(str).str.strip().str.lower()
            .map({"yes": 1, "1": 1, "true": 1, "no": 0, "0": 0, "false": 0}).astype(int))


def youden_threshold(y, prob):
    """Threshold maximising recall + specificity - 1; ties go to the one closest to 0.5."""
    best, best_j = 0.5, -np.inf
    for t in np.linspace(0.10, 0.90, 321):
        pred = prob >= t
        j = (pred[y == 1].mean() + (~pred[y == 0]).mean()) - 1
        if j > best_j + 1e-12 or (abs(j - best_j) <= 1e-12 and abs(t - 0.5) < abs(best - 0.5)):
            best, best_j = float(t), j
    return round(best, 6)


def bootstrap_auc_ci(y, prob, n=1000, seed=SEED):
    rng = np.random.default_rng(seed)
    pos, neg = np.where(y == 1)[0], np.where(y == 0)[0]
    aucs = []
    for _ in range(n):
        idx = np.concatenate([rng.choice(pos, len(pos)), rng.choice(neg, len(neg))])
        aucs.append(roc_auc_score(y[idx], prob[idx]))
    return [float(np.percentile(aucs, 2.5)), float(np.percentile(aucs, 97.5))]


def calibration_bins(y, prob, bins=10):
    edges = np.linspace(0, 1, bins + 1)
    ids = np.minimum(np.digitize(prob, edges[1:-1]), bins - 1)
    out = []
    for b in range(bins):
        mask = ids == b
        if mask.any():
            out.append({"bin_low": float(edges[b]), "bin_high": float(edges[b + 1]),
                        "count": int(mask.sum()), "mean_predicted": float(prob[mask].mean()),
                        "observed_rate": float(y[mask].mean())})
    return out


def _ref_value(x):
    x = float(x)
    return 0.0 if abs(x) < 1e-10 else float(f"{x:.4g}")


def build_schema(X_train, threshold):
    return {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "raw_columns": RAW_COLUMNS,
        "numeric_columns": RAW_NUMERIC_COLUMNS,
        "categorical_columns": RAW_CATEGORICAL_COLUMNS,
        "categories": {c: sorted(X_train[c].dropna().astype(str).unique().tolist())
                       for c in RAW_CATEGORICAL_COLUMNS},
        "reference_values": {
            **{c: _ref_value(pd.to_numeric(X_train[c], errors="coerce").median())
               for c in RAW_NUMERIC_COLUMNS},
            **{c: str(X_train[c].dropna().astype(str).mode().iloc[0])
               for c in RAW_CATEGORICAL_COLUMNS},
        },
        "labels": {c: LABELS[c] for c in RAW_COLUMNS},
        "decision_threshold": threshold,
    }


def main(train_csv, test_csv, out_dir) -> dict:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    train, test = pd.read_csv(train_csv), pd.read_csv(test_csv)
    X_train, X_test = train[RAW_COLUMNS], test[RAW_COLUMNS]
    y_train, y_test = map_target(train[TARGET]).to_numpy(), map_target(test[TARGET]).to_numpy()

    cv = StratifiedKFold(5, shuffle=True, random_state=SEED)
    oof = cross_val_predict(build_pipeline(), X_train, y_train, cv=cv,
                            method="predict_proba")[:, 1]
    threshold = youden_threshold(y_train, oof)

    pipeline = build_pipeline().fit(X_train, y_train)
    prob = pipeline.predict_proba(X_test)[:, 1]
    pred = (prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, pred, labels=[0, 1]).ravel()

    metrics = {
        "model_name": MODEL_NAME,
        "model_version": MODEL_VERSION,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "library_versions": {"sklearn": sklearn.__version__, "xgboost": xgboost.__version__,
                             "lightgbm": lightgbm.__version__, "pandas": pd.__version__,
                             "numpy": np.__version__},
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
        "train_prevalence": float(y_train.mean()),
        "test_prevalence": float(y_test.mean()),
        "decision_threshold": threshold,
        "accuracy": float(accuracy_score(y_test, pred)),
        "precision": float(precision_score(y_test, pred, zero_division=0)),
        "recall": float(recall_score(y_test, pred)),
        "f1": float(f1_score(y_test, pred)),
        "specificity": float(tn / (tn + fp)),
        "accuracy_at_0_5": float(accuracy_score(y_test, (prob >= 0.5).astype(int))),
        "auc": float(roc_auc_score(y_test, prob)),
        "auc_ci95": bootstrap_auc_ci(y_test, prob),
        "pr_auc": float(average_precision_score(y_test, prob)),
        "brier": float(brier_score_loss(y_test, prob)),
        "oof_auc": float(roc_auc_score(y_train, oof)),
        "calibration": calibration_bins(y_test, prob),
        "confusion_matrix": [[int(tn), int(fp)], [int(fn), int(tp)]],
        "note": NOTE,
    }

    joblib.dump(pipeline, out_dir / "cvd_pipeline.joblib", compress=3)
    (out_dir / "feature_schema.json").write_text(
        json.dumps(build_schema(X_train, threshold), indent=2) + "\n")
    (out_dir / "metrics_ml.json").write_text(json.dumps(metrics, indent=2) + "\n")
    return metrics


if __name__ == "__main__":
    here = Path(__file__).resolve().parent.parent / "model"
    result = main(here / "traindata.csv", here / "testdata.csv", here)
    json.dump(result, sys.stdout, indent=2)
    print()
