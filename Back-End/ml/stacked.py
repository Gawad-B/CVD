"""Serve the notebook's stacked ensemble from its saved parts.

The notebook (cvd_ml_fulltrain) saves the preprocessor, four base models and the logistic
meta-learner as separate files. Scoring a raw NHANES frame mirrors the notebook exactly:
add_features -> log1p on the train-skewed columns -> preprocessor -> base-model
probabilities (xgb, lgbm, rf, lr) -> meta-learner.
"""
from pathlib import Path
from typing import Any, Dict, List

import joblib
import numpy as np
import pandas as pd

from ml._native import import_lightgbm
from ml.features import FeatureEngineer

BASE_MODEL_NAMES = ["xgb", "lgbm", "rf", "lr"]


def skewed_columns(frame: pd.DataFrame, threshold: float = 1.0) -> List[str]:
    """Notebook rule: numeric columns that are non-negative with |skew| >= threshold."""
    columns = []
    for column in frame.columns:
        if not pd.api.types.is_numeric_dtype(frame[column]):
            continue
        values = frame[column].dropna()
        if values.min() >= 0 and abs(float(values.skew())) >= threshold:
            columns.append(column)
    return columns


class StackedEnsemble:
    def __init__(self, preprocessor: Any, base_models: Dict[str, Any], meta_learner: Any,
                 skew_columns: List[str]):
        self.preprocessor = preprocessor
        self.base_models = base_models
        self.meta_learner = meta_learner
        self.skew_columns = list(skew_columns)

    @classmethod
    def load(cls, model_dir: Path, skew_columns: List[str]) -> "StackedEnsemble":
        import_lightgbm()  # lightgbm needs the vendored libgomp loaded before unpickling
        return cls(
            preprocessor=joblib.load(model_dir / "preprocessor_ml.joblib"),
            base_models={name: joblib.load(model_dir / f"model_{name}.joblib") for name in BASE_MODEL_NAMES},
            meta_learner=joblib.load(model_dir / "meta_learner.joblib"),
            skew_columns=skew_columns,
        )

    def transform(self, X: pd.DataFrame) -> np.ndarray:
        frame = FeatureEngineer().transform(X)
        for column in self.skew_columns:
            frame[column] = np.log1p(np.clip(pd.to_numeric(frame[column], errors="coerce"), 0, None))
        return np.asarray(self.preprocessor.transform(frame[list(self.preprocessor.feature_names_in_)]))

    def base_probabilities(self, X: pd.DataFrame) -> np.ndarray:
        processed = self.transform(X)
        columns = []
        for name in BASE_MODEL_NAMES:
            model = self.base_models[name]
            names = getattr(model, "feature_names_in_", None)
            data = pd.DataFrame(processed, columns=names) if names is not None else processed
            columns.append(model.predict_proba(data)[:, 1])
        return np.column_stack(columns)

    def predict_proba(self, X: pd.DataFrame) -> np.ndarray:
        return self.meta_learner.predict_proba(self.base_probabilities(X))

    def feature_names(self) -> List[str]:
        return [str(name) for name in self.preprocessor.get_feature_names_out()]
