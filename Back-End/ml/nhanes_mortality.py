"""NHANES 1999-2008 + NCHS Linked Mortality Files (follow-up through 2019): a prospective dataset.

Each participant is examined once and followed through the National Death Index. The outcome is
death from heart disease or stroke within 10 years of the exam (`CVD_DEATH_10Y`). All five cycles
were examined by 2008, so every survivor has more than 10 years of follow-up and the 10-year
outcome is fully observed. People who already reported CVD at the exam (MCQ160B-F) are excluded,
so the model predicts future events rather than recognising existing disease.

Every cycle is harmonised onto the raw NHANES column names used by `ml.nhanes` (and sent by the
API), so the same `build_raw_row` input feeds both models.
"""
import io
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np
import pandas as pd

from ml.nhanes import RAW_COLUMNS

NHANES_URL = "https://wwwn.cdc.gov/Nchs/Data/Nhanes/Public/{year}/DataFiles/{table}.xpt"
MORT_URL = ("https://ftp.cdc.gov/pub/Health_Statistics/NCHS/datalinkage/linked_mortality/"
            "NHANES_{cycle}_MORT_2019_PUBLIC.dat")

# cycle -> (first exam year, tables). Lab file names changed in 2005.
CYCLES: Dict[str, tuple] = {
    "1999_2000": (1999, ["DEMO", "BPX", "BMX", "Lab13", "Lab10", "Lab18", "Lab16", "Lab25", "SMQ", "DIQ", "BPQ", "MCQ", "HUQ"]),
    "2001_2002": (2001, ["DEMO_B", "BPX_B", "BMX_B", "L13_B", "L10_B", "L40_B", "L16_B", "L25_B", "SMQ_B", "DIQ_B", "BPQ_B", "MCQ_B", "HUQ_B"]),
    "2003_2004": (2003, ["DEMO_C", "BPX_C", "BMX_C", "L13_C", "L10_C", "L40_C", "L16_C", "L25_C", "SMQ_C", "DIQ_C", "BPQ_C", "MCQ_C", "HUQ_C"]),
    "2005_2006": (2005, ["DEMO_D", "BPX_D", "BMX_D", "TCHOL_D", "HDL_D", "GHB_D", "BIOPRO_D", "ALB_CR_D", "CBC_D", "SMQ_D", "DIQ_D", "BPQ_D", "MCQ_D", "HUQ_D"]),
    "2007_2008": (2007, ["DEMO_E", "BPX_E", "BMX_E", "TCHOL_E", "HDL_E", "GHB_E", "BIOPRO_E", "ALB_CR_E", "CBC_E", "SMQ_E", "DIQ_E", "BPQ_E", "MCQ_E", "HUQ_E"]),
}
BASELINE_CVD = ["MCQ160B", "MCQ160C", "MCQ160D", "MCQ160E", "MCQ160F"]
CVD_CAUSES = {1, 5}  # UCOD_LEADING: 1 = diseases of heart, 5 = cerebrovascular diseases
HORIZON_MONTHS = 120

# Serum creatinine standardisation to the IDMS-traceable method (NHANES documentation;
# Selvin et al., Am J Kidney Dis 2007): 1999-2000 and 2005-2006 need a correction.
_CREATININE_CORRECTION = {"1999_2000": (1.013, 0.147), "2005_2006": (0.978, -0.016)}
# RIDRETH1 (all cycles) -> RIDRETH3 codes used by the app; Asian is not separable before 2011.
_RACE1_TO_RACE3 = {1: 1, 2: 2, 3: 3, 4: 4, 5: 7}


def _download(url: str, path: Optional[Path]) -> bytes:
    if path is not None and path.exists():
        return path.read_bytes()
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=120) as response:
        data = response.read()
    if path is not None:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return data


def _xpt(year: int, table: str, cache_dir: Optional[Path]) -> pd.DataFrame:
    data = _download(NHANES_URL.format(year=year, table=table), cache_dir / f"{table}.xpt" if cache_dir else None)
    return pd.read_sas(io.BytesIO(data), format="xport", encoding="latin1")


def read_mortality(cycle: str, cache_dir: Optional[Path] = None) -> pd.DataFrame:
    """Public-use Linked Mortality File (fixed width; layout from the NCHS R read-in program)."""
    name = f"NHANES_{cycle}_MORT_2019_PUBLIC.dat"
    data = _download(MORT_URL.format(cycle=cycle), cache_dir / name if cache_dir else None)
    return pd.read_fwf(
        io.BytesIO(data),
        colspecs=[(0, 6), (14, 15), (15, 16), (16, 19), (42, 45), (45, 48)],
        names=["SEQN", "ELIGSTAT", "MORTSTAT", "UCOD_LEADING", "PERMTH_INT", "PERMTH_EXM"],
        na_values=["."],
    )


def _first(frame: pd.DataFrame, *names: str) -> pd.Series:
    for name in names:
        if name in frame:
            return pd.to_numeric(frame[name], errors="coerce")
    return pd.Series(np.nan, index=frame.index)


def _mean_reading(frame: pd.DataFrame, prefix: str) -> pd.Series:
    readings = [pd.to_numeric(frame[f"{prefix}{i}"], errors="coerce") for i in range(1, 5) if f"{prefix}{i}" in frame]
    stacked = pd.concat(readings, axis=1).where(lambda d: d > 0)  # 0 = not obtained (diastolic)
    return stacked.mean(axis=1)


def harmonise(cycle: str, merged: pd.DataFrame) -> pd.DataFrame:
    """One cycle's merged tables -> RAW_COLUMNS (current NHANES names and coding) + SEQN, CYCLE."""
    out = pd.DataFrame({"SEQN": merged["SEQN"].astype(int), "CYCLE": cycle})
    copy = ["RIDAGEYR", "RIAGENDR", "DMDEDUC2", "INDFMPIR", "BMXBMI", "BMXWAIST", "LBXTC", "LBXGH",
            "LBXSTR", "LBXSUA", "LBXSGL", "LBXSNASI", "LBXWBCSI", "LBXHGB", "LBXPLTSI", "LBXRDW",
            "SMQ020", "SMQ040", "DIQ010", "BPQ020", "BPQ080", "HUQ010"]
    for column in copy:
        out[column] = _first(merged, column)
    out["RIDRETH3"] = _first(merged, "RIDRETH1").map(_RACE1_TO_RACE3)
    out["BPXOSY1"] = _mean_reading(merged, "BPXSY")
    out["BPXODI1"] = _mean_reading(merged, "BPXDI")
    out["LBDHDD"] = _first(merged, "LBDHDD", "LBXHDD", "LBDHDL")
    creatinine = _first(merged, "LBXSCR", "LBDSCR")
    slope, intercept = _CREATININE_CORRECTION.get(cycle, (1.0, 0.0))
    out["LBXSCR"] = creatinine * slope + intercept
    out["URDACT"] = _first(merged, "URXUMA") / _first(merged, "URXUCR") * 100  # mg/L / mg/dL -> mg/g
    # BP medication: BPQ050A ("now taking prescribed medicine"), asked of people told about high BP.
    out["BPQ150"] = _first(merged, "BPQ050A")
    # Cholesterol medication: BPQ100D ("now taking"), asked of people advised to take it; those never
    # told of high cholesterol or never advised to take medicine are not taking it.
    statin = _first(merged, "BPQ100D")
    not_asked = statin.isna() & (_first(merged, "BPQ080").eq(2) | _first(merged, "BPQ090D").eq(2))
    out["BPQ101D"] = statin.where(~not_asked, 2.0)
    for column in RAW_COLUMNS:
        if column not in out:
            out[column] = np.nan  # e.g. hs-CRP, sleep, sedentary time: not measured in these cycles
    for column in BASELINE_CVD:
        out[column] = _first(merged, column)
    return out


def build_dataset(cache_dir: Optional[Path] = None) -> pd.DataFrame:
    """Adults 20+ without CVD at the exam, eligible for mortality linkage, with BP and cholesterol.

    Returns SEQN, CYCLE, RAW_COLUMNS, follow-up columns and CVD_DEATH_10Y (0/1).
    """
    frames: List[pd.DataFrame] = []
    for cycle, (year, tables) in CYCLES.items():
        merged = None
        for table in tables:
            frame = _xpt(year, table, cache_dir)
            frame = frame[[c for c in frame.columns if not c.startswith("WT")]]
            merged = frame if merged is None else merged.merge(frame, on="SEQN", how="left", suffixes=("", f"_{table}"))
        frames.append(harmonise(cycle, merged).merge(read_mortality(cycle, cache_dir), on="SEQN", how="left"))
    data = pd.concat(frames, ignore_index=True)
    prior_cvd = (data[BASELINE_CVD] == 1).any(axis=1)
    keep = (
        (data["RIDAGEYR"] >= 20) & (data["ELIGSTAT"] == 1) & ~prior_cvd
        & data["BPXOSY1"].notna() & data["LBXTC"].notna()
    )
    data = data[keep].copy()
    cvd_death = (data["MORTSTAT"] == 1) & data["UCOD_LEADING"].isin(CVD_CAUSES)
    data["CVD_DEATH_10Y"] = (cvd_death & (data["PERMTH_EXM"] <= HORIZON_MONTHS)).astype(int)
    data["DIED_OTHER_10Y"] = ((data["MORTSTAT"] == 1) & ~cvd_death & (data["PERMTH_EXM"] <= HORIZON_MONTHS)).astype(int)
    return data[["SEQN", "CYCLE"] + RAW_COLUMNS + ["MORTSTAT", "UCOD_LEADING", "PERMTH_EXM",
                                                    "CVD_DEATH_10Y", "DIED_OTHER_10Y"]].reset_index(drop=True)
