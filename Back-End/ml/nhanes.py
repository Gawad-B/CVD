"""NHANES 2021-2023 dataset builder and the feature pipeline shared by training and serving.

The notebook (model/cvd_nhanes_v2.ipynb) builds the dataset with `build_dataset`, and the API
scores patients with the pipeline from `build_pipeline`; both use `NhanesFeatures`, so the
features are computed by the same code in training and in production.

Inputs are raw NHANES columns with NHANES coding (e.g. yes = 1, no = 2; refused / don't know
codes become missing). The label is self-reported, doctor-diagnosed CVD: congestive heart
failure, coronary heart disease, angina, heart attack or stroke (MCQ160B-F).
"""
import io
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.base import BaseEstimator, TransformerMixin
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

CYCLE_URL = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/2021/DataFiles/{table}.xpt"
LABEL_COLUMNS = ["MCQ160B", "MCQ160C", "MCQ160D", "MCQ160E", "MCQ160F"]

# table -> columns used (SEQN is the join key)
TABLES: Dict[str, List[str]] = {
    "DEMO_L": ["RIDAGEYR", "RIAGENDR", "RIDRETH3", "DMDEDUC2", "INDFMPIR"],
    "BPXO_L": ["BPXOSY1", "BPXODI1"],
    "BMX_L": ["BMXBMI", "BMXWAIST"],
    "TCHOL_L": ["LBXTC"],
    "HDL_L": ["LBDHDD"],
    "GHB_L": ["LBXGH"],
    "HSCRP_L": ["LBXHSCRP"],
    "CBC_L": ["LBXWBCSI", "LBXHGB", "LBXPLTSI", "LBXRDW"],
    "BIOPRO_L": ["LBXSNASI", "LBXSCR", "LBXSTR", "LBXSUA", "LBXSGL"],
    "ALB_CR_L": ["URDACT"],
    "SLQ_L": ["SLD012", "SLD013"],
    "PAQ_L": ["PAD680"],
    "SMQ_L": ["SMQ020", "SMQ040"],
    "DIQ_L": ["DIQ010"],
    "BPQ_L": ["BPQ020", "BPQ080", "BPQ150", "BPQ101D"],
    "HUQ_L": ["HUQ010"],
    "MCQ_L": LABEL_COLUMNS,
}

RAW_NUMERIC_COLUMNS = [
    "RIDAGEYR", "INDFMPIR", "BMXBMI", "BMXWAIST", "BPXOSY1", "BPXODI1", "LBXTC", "LBDHDD", "LBXGH",
    "LBXHSCRP", "LBXSNASI", "LBXWBCSI", "LBXHGB", "LBXPLTSI", "LBXRDW", "LBXSCR", "LBXSTR", "LBXSUA",
    "LBXSGL", "URDACT", "SLD012", "SLD013", "PAD680",
]
RAW_CODED_COLUMNS = [
    "RIAGENDR", "RIDRETH3", "DMDEDUC2", "SMQ020", "SMQ040", "DIQ010",
    "BPQ020", "BPQ080", "BPQ150", "BPQ101D", "HUQ010",
]
RAW_COLUMNS = RAW_NUMERIC_COLUMNS + RAW_CODED_COLUMNS

LABELS = {
    "RIDAGEYR": "Age", "INDFMPIR": "Income-to-poverty ratio", "BMXBMI": "BMI", "BMXWAIST": "Waist (cm)",
    "BPXOSY1": "Systolic BP", "BPXODI1": "Diastolic BP", "LBXTC": "Total cholesterol", "LBDHDD": "HDL",
    "LBXGH": "HbA1c", "LBXHSCRP": "hs-CRP", "LBXSNASI": "Sodium", "LBXWBCSI": "WBC", "LBXHGB": "Hemoglobin",
    "LBXPLTSI": "Platelets", "LBXRDW": "RDW", "LBXSCR": "Creatinine", "LBXSTR": "Triglycerides",
    "LBXSUA": "Uric acid", "LBXSGL": "Glucose", "URDACT": "Urine albumin/creatinine",
    "SLD012": "Sleep hours (weekday)", "SLD013": "Sleep hours (weekend)", "PAD680": "Sedentary minutes per day",
    "RIAGENDR": "Sex", "RIDRETH3": "Race/ethnicity", "DMDEDUC2": "Education", "SMQ020": "Ever smoked",
    "SMQ040": "Smokes now", "DIQ010": "Diabetes", "BPQ020": "High blood pressure (ever told)",
    "BPQ080": "High cholesterol (ever told)", "BPQ150": "On BP medication",
    "BPQ101D": "On cholesterol-lowering medication", "HUQ010": "General health (self-rated)",
}

# Readable names for the engineered model features (FEATURE_COLUMNS).
FEATURE_LABELS = {
    "age": "Age", "male": "Male sex", "education": "Education", "income_ratio": "Income-to-poverty ratio",
    "bmi": "BMI", "waist": "Waist", "sbp": "Systolic BP", "dbp": "Diastolic BP", "pulse_pressure": "Pulse pressure",
    "total_chol": "Total cholesterol", "hdl": "HDL", "non_hdl": "Non-HDL cholesterol",
    "tc_hdl_ratio": "Cholesterol/HDL ratio", "hba1c": "HbA1c", "log_crp": "hs-CRP", "sodium": "Sodium",
    "wbc": "WBC", "hgb": "Hemoglobin", "platelets": "Platelets", "rdw": "RDW", "egfr": "Kidney function (eGFR)",
    "log_trig": "Triglycerides", "uric_acid": "Uric acid", "glucose": "Glucose", "log_uacr": "Urine albumin/creatinine",
    "sleep_weekday": "Sleep (weekday)", "sleep_weekend": "Sleep (weekend)", "sedentary_min": "Sedentary time",
    "smoker_ever": "Ever smoked", "smoke_now": "Smokes now", "diabetes": "Diabetes",
    "high_bp_hx": "High blood pressure (history)", "high_chol_hx": "High cholesterol (history)",
    "bp_meds": "On BP medication", "chol_meds": "On cholesterol medication",
    "gen_health": "Self-rated health (poorer)",
    "race_mexican": "Mexican American", "race_other_hispanic": "Other Hispanic", "race_white": "Non-Hispanic White",
    "race_black": "Non-Hispanic Black", "race_asian": "Non-Hispanic Asian", "race_other": "Other race",
}

# Codes meaning refused / don't know / out of range in NHANES questionnaires.
_MISSING_CODES = {7, 9, 77, 99, 777, 999, 7777, 9999}
_RACE_CODES = {1: "mexican", 2: "other_hispanic", 3: "white", 4: "black", 6: "asian", 7: "other"}

# Treatment inputs (BP and cholesterol medication) are collected for AHA PREVENT but kept out of
# the ML model: with a cross-sectional "already diagnosed" label they act as proxies for the
# diagnosis. The notebook measures the effect of adding them back (MEDICATION_COLUMNS).
MEDICATION_COLUMNS = ["bp_meds", "chol_meds"]
FEATURE_COLUMNS = [
    "age", "male", "education", "income_ratio", "bmi", "waist", "sbp", "dbp", "pulse_pressure",
    "total_chol", "hdl", "non_hdl", "tc_hdl_ratio", "hba1c", "log_crp", "sodium", "wbc", "hgb",
    "platelets", "rdw", "egfr", "log_trig", "uric_acid", "glucose", "log_uacr", "sleep_weekday",
    "sleep_weekend", "sedentary_min", "smoker_ever", "smoke_now", "diabetes", "high_bp_hx",
    "high_chol_hx", "gen_health",
] + [f"race_{name}" for name in _RACE_CODES.values()]


def _num(frame: pd.DataFrame, column: str) -> pd.Series:
    return pd.to_numeric(frame[column], errors="coerce") if column in frame else pd.Series(np.nan, index=frame.index)


def _code(frame: pd.DataFrame, column: str) -> pd.Series:
    values = _num(frame, column)
    return values.where(~values.isin(_MISSING_CODES))


def _yes_no(frame: pd.DataFrame, column: str) -> pd.Series:
    return _code(frame, column).map({1: 1.0, 2: 0.0})


def ckd_epi_2021(creatinine_mg_dl: pd.Series, age: pd.Series, male: pd.Series) -> pd.Series:
    """eGFR (mL/min/1.73m2), race-free CKD-EPI 2021 creatinine equation."""
    female = male == 0
    kappa = np.where(female, 0.7, 0.9)
    alpha = np.where(female, -0.241, -0.302)
    ratio = creatinine_mg_dl / kappa
    egfr = 142 * np.minimum(ratio, 1) ** alpha * np.maximum(ratio, 1) ** -1.2 * 0.9938 ** age
    return pd.Series(np.where(female, egfr * 1.012, egfr), index=creatinine_mg_dl.index).where(male.notna())


class NhanesFeatures(BaseEstimator, TransformerMixin):
    """Stateless: raw NHANES-coded columns -> numeric model features (`columns`, FEATURE_COLUMNS by default)."""

    def __init__(self, columns=None, age_max=None, age_min=None):
        self.columns = columns
        self.age_max = age_max  # cap at the oldest age seen in training (NHANES top-codes age)
        self.age_min = age_min  # and at the youngest

    def fit(self, X, y=None):
        return self

    def transform(self, X) -> pd.DataFrame:
        raw = pd.DataFrame(X)
        f = pd.DataFrame(index=raw.index)
        age = _num(raw, "RIDAGEYR")
        sex = _code(raw, "RIAGENDR")
        # getattr: older pickles predate these attributes
        f["age"] = age.clip(lower=getattr(self, "age_min", None), upper=getattr(self, "age_max", None))
        f["male"] = sex.map({1: 1.0, 2: 0.0})
        f["education"] = _code(raw, "DMDEDUC2").where(lambda s: s.between(1, 5))
        f["income_ratio"] = _num(raw, "INDFMPIR")
        f["bmi"] = _num(raw, "BMXBMI")
        f["waist"] = _num(raw, "BMXWAIST")
        f["sbp"] = _num(raw, "BPXOSY1")
        f["dbp"] = _num(raw, "BPXODI1")
        f["pulse_pressure"] = f["sbp"] - f["dbp"]
        f["total_chol"] = _num(raw, "LBXTC")
        f["hdl"] = _num(raw, "LBDHDD")
        f["non_hdl"] = f["total_chol"] - f["hdl"]
        f["tc_hdl_ratio"] = f["total_chol"] / f["hdl"].replace(0, np.nan)
        f["hba1c"] = _num(raw, "LBXGH")
        f["log_crp"] = np.log1p(_num(raw, "LBXHSCRP").clip(lower=0))
        f["sodium"] = _num(raw, "LBXSNASI")
        f["wbc"] = _num(raw, "LBXWBCSI")
        f["hgb"] = _num(raw, "LBXHGB")
        f["platelets"] = _num(raw, "LBXPLTSI")
        f["rdw"] = _num(raw, "LBXRDW")
        f["egfr"] = ckd_epi_2021(_num(raw, "LBXSCR"), age, f["male"])
        f["log_trig"] = np.log(_num(raw, "LBXSTR").clip(lower=1))
        f["uric_acid"] = _num(raw, "LBXSUA")
        f["glucose"] = _num(raw, "LBXSGL")
        f["log_uacr"] = np.log1p(_num(raw, "URDACT").clip(lower=0))
        f["sleep_weekday"] = _num(raw, "SLD012")
        f["sleep_weekend"] = _num(raw, "SLD013")
        f["sedentary_min"] = _code(raw, "PAD680").where(lambda s: s <= 1440)
        smoker_ever = _yes_no(raw, "SMQ020")
        f["smoker_ever"] = smoker_ever
        # SMQ040 (now smoking) is only asked of ever-smokers: never-smokers do not smoke now.
        f["smoke_now"] = _code(raw, "SMQ040").map({1: 1.0, 2: 1.0, 3: 0.0}).where(smoker_ever != 0, 0.0)
        f["diabetes"] = _code(raw, "DIQ010").map({1: 1.0, 2: 0.0, 3: 0.5})
        high_bp = _yes_no(raw, "BPQ020")
        f["high_bp_hx"] = high_bp
        f["high_chol_hx"] = _yes_no(raw, "BPQ080")
        # BPQ150 (BP medication) is only asked of people told they have high BP.
        f["bp_meds"] = _yes_no(raw, "BPQ150").where(high_bp != 0, 0.0)
        f["chol_meds"] = _yes_no(raw, "BPQ101D")
        f["gen_health"] = _code(raw, "HUQ010").where(lambda s: s.between(1, 5))
        race = _code(raw, "RIDRETH3")
        for code, name in _RACE_CODES.items():
            f[f"race_{name}"] = (race == code).astype(float).where(race.notna())
        return f[list(self.columns or FEATURE_COLUMNS)]


def build_pipeline(model, columns=None, age_max=None) -> Pipeline:
    """Raw NHANES columns -> features -> median imputation (+ missing flags) -> scaling -> model."""
    return Pipeline([
        ("features", NhanesFeatures(columns, age_max)),
        ("impute", SimpleImputer(strategy="median", add_indicator=True)),
        ("scale", StandardScaler()),
        ("model", model),
    ])


def model_coefficients(pipeline: Pipeline) -> pd.Series:
    """Standardised logistic-regression coefficients per model feature (missing-flag columns dropped).

    Works for a plain LogisticRegression and for a sigmoid-calibrated one (CalibratedClassifierCV),
    where the coefficients of the per-fold models are averaged.
    """
    model = pipeline.named_steps["model"]
    fitted = [c.estimator for c in model.calibrated_classifiers_] if hasattr(model, "calibrated_classifiers_") else [model]
    columns = list(pipeline.named_steps["features"].columns or FEATURE_COLUMNS)
    coef = np.mean([m.coef_[0][: len(columns)] for m in fitted], axis=0)
    return pd.Series(coef, index=columns)


def _read_table(table: str, cache_dir: Optional[Path]) -> pd.DataFrame:
    path = cache_dir / f"{table}.xpt" if cache_dir else None
    if path is not None and path.exists():
        data = path.read_bytes()
    else:
        request = urllib.request.Request(CYCLE_URL.format(table=table), headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(request, timeout=120) as response:
            data = response.read()
        if path is not None:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    frame = pd.read_sas(io.BytesIO(data), format="xport", encoding="latin1")
    return frame[["SEQN"] + TABLES[table]]


def build_dataset(cache_dir: Optional[Path] = None) -> pd.DataFrame:
    """Adults (18+) with measured BP and total cholesterol and a known CVD history.

    Returns RAW_COLUMNS plus SEQN and CVD (1 = any of MCQ160B-F answered yes).
    """
    merged = None
    for table in TABLES:
        frame = _read_table(table, cache_dir)
        merged = frame if merged is None else merged.merge(frame, on="SEQN", how="left")
    adults = merged[(merged["RIDAGEYR"] >= 18) & merged["BPXOSY1"].notna() & merged["LBXTC"].notna()]
    answered = adults[LABEL_COLUMNS].isin([1, 2]).any(axis=1)
    data = adults[answered].copy()
    data["CVD"] = (data[LABEL_COLUMNS] == 1).any(axis=1).astype(int)
    return data[["SEQN"] + RAW_COLUMNS + ["CVD"]].reset_index(drop=True)
