"""Build feature_schema.json and complete metrics_ml.json for the notebook's saved models.

Run after copying a new notebook export (preprocessor_ml, model_{xgb,lgbm,rf,lr},
meta_learner, metrics_ml.json, test_probs_stack.npy) into Back-End/model/:

    python scripts/build_model_metadata.py

It re-derives the notebook's skewed-column list from traindata.csv, checks that the app
reproduces the notebook's saved test probabilities, writes the schema the API needs and
adds the extra fields the API reads to metrics_ml.json (the notebook's own numbers are kept).
Does not import the FastAPI app, so no env vars are required.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import brier_score_loss, confusion_matrix

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from ml.features import FeatureEngineer, RAW_COLUMNS  # noqa: E402
from ml.stacked import StackedEnsemble, skewed_columns  # noqa: E402
from ml.train import TARGET, bootstrap_auc_ci, build_schema, calibration_bins, map_target  # noqa: E402

MODEL_DIR = BACKEND / "model"
MODEL_NAME = "CVD Stacked Ensemble"
MODEL_VERSION = "3.0.0"
NOTE = ("Decision threshold was tuned on the test set (notebook), so test accuracy is "
        "optimistic. Dataset is class-balanced (~50% prevalence); probabilities are not "
        "calibrated to clinical population prevalence.")


def train_frame(train: pd.DataFrame) -> pd.DataFrame:
    """Notebook: add_features, then drop exact duplicate (features + label) rows."""
    frame = FeatureEngineer().transform(train[RAW_COLUMNS])
    frame[TARGET] = map_target(train[TARGET]).to_numpy()
    return frame.drop_duplicates().reset_index(drop=True)


def main() -> None:
    train = pd.read_csv(MODEL_DIR / "traindata.csv")
    test = pd.read_csv(MODEL_DIR / "testdata.csv")
    deduped = train_frame(train)
    skew = skewed_columns(deduped.drop(columns=[TARGET]))

    metrics = json.loads((MODEL_DIR / "metrics_ml.json").read_text())
    threshold = float(metrics.get("decision_threshold", metrics["threshold"]))

    model = StackedEnsemble.load(MODEL_DIR, skew)
    prob = model.predict_proba(test[RAW_COLUMNS])[:, 1]
    saved = np.load(MODEL_DIR / "test_probs_stack.npy")
    gap = float(np.abs(prob - saved).max())
    if gap > 1e-6:
        raise SystemExit(f"App scoring differs from the notebook's saved test probabilities (max gap {gap:.2e})")

    y_test = map_target(test[TARGET]).to_numpy()
    y_train = deduped[TARGET].to_numpy()
    pred = (prob >= threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_test, pred, labels=[0, 1]).ravel()

    schema = build_schema(train[RAW_COLUMNS], threshold)
    schema.update(model_name=MODEL_NAME, model_version=MODEL_VERSION, skew_columns=skew)

    metrics.update(
        model_name=MODEL_NAME,
        model_version=MODEL_VERSION,
        n_train=int(len(y_train)),
        n_test=int(len(y_test)),
        train_prevalence=float(y_train.mean()),
        test_prevalence=float(y_test.mean()),
        decision_threshold=threshold,
        specificity=float(tn / (tn + fp)),
        accuracy_at_0_5=float(metrics.get("default_threshold_accuracy", ((prob >= 0.5) == y_test).mean())),
        auc_ci95=bootstrap_auc_ci(y_test, prob),
        brier=float(brier_score_loss(y_test, prob)),
        calibration=calibration_bins(y_test, prob),
        note=NOTE,
    )

    (MODEL_DIR / "feature_schema.json").write_text(json.dumps(schema, indent=2) + "\n")
    (MODEL_DIR / "metrics_ml.json").write_text(json.dumps(metrics, indent=2) + "\n")
    print(f"Reproduced notebook test probabilities (max gap {gap:.1e}); "
          f"accuracy {metrics['accuracy']:.4f} at threshold {threshold:.4f}")
    print(f"Skewed columns: {skew}")


if __name__ == "__main__":
    main()
