"""Feature engineering and the full CVD pipeline (all preprocessing lives inside it)."""
import numpy as np
import pandas as pd
from ml._native import import_lightgbm
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, StackingClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, RobustScaler

from xgboost import XGBClassifier

LGBMClassifier = import_lightgbm().LGBMClassifier  # lightgbm needs the vendored libgomp loaded first

SEED = 42

RAW_NUMERIC_COLUMNS = [
    "PAD810Q", "PAD790Q", "PAD800", "PAD680", "SLD012", "SLD013", "RIDAGEYR", "INDFMPIR",
    "BMXBMI", "BMXWAIST", "BPXOSY1", "BPXODI1", "LBXTC", "LBDHDD", "LBXGH", "LBXHSCRP",
    "LBXSNASI", "LBXWBCSI", "LBXHGB", "LBXPLTSI", "LBXRDW",
]
RAW_CATEGORICAL_COLUMNS = [
    "SMQ020", "PAD790U", "DIQ010", "RIAGENDR", "RIDRETH3", "DMDEDUC2",
    "BPQ101D", "BPQ020", "BPQ080", "RXQ033",
]
RAW_COLUMNS = RAW_NUMERIC_COLUMNS + RAW_CATEGORICAL_COLUMNS
ENGINEERED_COLUMNS = [
    "pulse_pressure", "tc_hdl_ratio", "bmi_age", "waist_bmi",
    "sleep_diff", "hba1c_age", "sbp_age", "log_crp",
]


def _num(df, col):
    return pd.to_numeric(df[col], errors="coerce")


class FeatureEngineer(BaseEstimator, TransformerMixin):
    """Stateless: coerces numerics and adds the engineered columns (notebook add_features)."""

    def fit(self, X, y=None):
        return self

    def transform(self, X):
        df = pd.DataFrame(X).copy()
        for col in RAW_NUMERIC_COLUMNS:
            if col in df.columns:
                df[col] = _num(df, col)
        df["pulse_pressure"] = df["BPXOSY1"] - df["BPXODI1"]
        df["tc_hdl_ratio"] = df["LBXTC"] / df["LBDHDD"].replace(0, np.nan)
        df["bmi_age"] = df["BMXBMI"] * df["RIDAGEYR"] / 100
        df["waist_bmi"] = df["BMXWAIST"] / df["BMXBMI"].replace(0, np.nan)
        df["sleep_diff"] = (df["SLD012"] - df["SLD013"]).abs()
        df["hba1c_age"] = df["LBXGH"] * df["RIDAGEYR"] / 100
        df["sbp_age"] = df["BPXOSY1"] * df["RIDAGEYR"] / 1000
        df["log_crp"] = np.log1p(df["LBXHSCRP"].clip(0))
        return df


class SkewLog1p(BaseEstimator, TransformerMixin):
    """Log1p on numeric columns that are non-negative and skewed, chosen on fit data only."""

    def __init__(self, threshold=1.0):
        self.threshold = threshold

    def fit(self, X, y=None):
        df = pd.DataFrame(X)
        cols = []
        for col in df.columns:
            if not pd.api.types.is_numeric_dtype(df[col]):
                continue
            values = df[col].dropna()
            if len(values) > 2 and values.min() >= 0 and abs(float(values.skew())) >= self.threshold:
                cols.append(col)
        self.columns_ = cols
        return self

    def transform(self, X):
        df = pd.DataFrame(X).copy()
        for col in self.columns_:
            if col in df.columns:
                df[col] = np.log1p(np.clip(pd.to_numeric(df[col], errors="coerce"), 0, None))
        return df


def _stack():
    xgb = XGBClassifier(
        n_estimators=600, learning_rate=0.03, max_depth=4,
        subsample=0.80, colsample_bytree=0.80, min_child_weight=3,
        gamma=0.1, reg_alpha=0.5, reg_lambda=1.5,
        eval_metric="logloss", random_state=SEED, n_jobs=-1, verbosity=0,
    )
    lgbm = LGBMClassifier(
        n_estimators=600, learning_rate=0.03, max_depth=4,
        num_leaves=20, subsample=0.80, colsample_bytree=0.80,
        min_child_samples=10, reg_alpha=0.5, reg_lambda=1.5,
        random_state=SEED, n_jobs=-1, verbosity=-1,
    )
    rf = RandomForestClassifier(
        n_estimators=500, min_samples_leaf=2, max_features="sqrt",
        random_state=SEED, n_jobs=-1,
    )
    lr = LogisticRegression(C=0.1, max_iter=1000, random_state=SEED)
    return StackingClassifier(
        estimators=[("xgb", xgb), ("lgbm", lgbm), ("rf", rf), ("lr", lr)],
        final_estimator=LogisticRegression(C=1.0, max_iter=1000, random_state=SEED),
        cv=StratifiedKFold(5, shuffle=True, random_state=SEED),
        stack_method="predict_proba",
        n_jobs=1,
    )


def build_pipeline() -> Pipeline:
    numeric = Pipeline([
        ("imp", SimpleImputer(strategy="median")),
        ("sc", RobustScaler()),
    ])
    categorical = Pipeline([
        ("imp", SimpleImputer(strategy="most_frequent")),
        ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])
    pre = ColumnTransformer([
        ("num", numeric, RAW_NUMERIC_COLUMNS + ENGINEERED_COLUMNS),
        ("cat", categorical, RAW_CATEGORICAL_COLUMNS),
    ])
    # Named columns end to end, so LightGBM sees the same feature names at fit and predict.
    pre.set_output(transform="pandas")
    return Pipeline([
        ("features", FeatureEngineer()),
        ("skew", SkewLog1p()),
        ("pre", pre),
        ("clf", _stack()),
    ])
