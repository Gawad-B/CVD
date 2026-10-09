"""AHA PREVENT 10-year total CVD risk (Khan SS et al., Circulation 2024;149:430-449).

Coefficients are the published 10-year total-CVD equations, cross-checked against two independent
implementations (R package preventr and bcjaeger/PooledCohort). Model choice follows preventr:
base model, + UACR, + HbA1c, or the full model (UACR and HbA1c, social deprivation index missing).

Valid only for ages 30-79 and in-range inputs; anything else returns `available: False` with a
reason rather than an extrapolated number.
"""
import math
from typing import Any, Dict, Optional

import pandas as pd

from ml.nhanes import ckd_epi_2021

MG_DL_TO_MMOL_L = 0.02586

# model -> sex -> (22 term coefficients, extra-term coefficients, constant). Term order:
# age, non_hdl, hdl, sbp_lt_110, sbp_gte_110, dm, smoking, bmi_lt_30, bmi_gte_30, egfr_lt_60,
# egfr_gte_60, bp_tx, statin, bp_tx*sbp_gte_110, statin*non_hdl, age*non_hdl, age*hdl,
# age*sbp_gte_110, age*dm, age*smoking, age*bmi_gte_30, age*egfr_lt_60
_COEF: Dict[str, Dict[str, tuple]] = {
    "base": {
        "female": ([0.7939329, 0.0305239, -0.1606857, -0.2394003, 0.3600781, 0.8667604, 0.5360739, 0, 0,
                    0.6045917, 0.0433769, 0.3151672, -0.1477655, -0.0663612, 0.1197879, -0.0819715,
                    0.0306769, -0.0946348, -0.27057, -0.078715, 0, -0.1637806], {}, -3.307728),
        "male": ([0.7688528, 0.0736174, -0.0954431, -0.4347345, 0.3362658, 0.7692857, 0.4386871, 0, 0,
                  0.5378979, 0.0164827, 0.288879, -0.1337349, -0.0475924, 0.150273, -0.0517874,
                  0.0191169, -0.1049477, -0.2251948, -0.0895067, 0, -0.1543702], {}, -3.031168),
    },
    "uacr": {
        "female": ([0.7969249, 0.0256635, -0.1588107, -0.2255701, 0.3396649, 0.8047515, 0.5285338, 0, 0,
                    0.4803511, 0.0434472, 0.2985207, -0.1497787, -0.0742889, 0.106756, -0.0778126,
                    0.0306768, -0.0907168, -0.2705122, -0.0830564, 0, -0.1389249],
                   {"ln_uacr": 0.1793037, "missing_uacr": 0.0132073}, -3.738341),
        "male": ([0.7768655, 0.0659949, -0.0951111, -0.420667, 0.3120151, 0.698521, 0.4314669, 0, 0,
                  0.3841364, 0.009384, 0.2676494, -0.1390966, -0.0579315, 0.1383719, -0.0488332,
                  0.0200406, -0.102454, -0.2236355, -0.089485, 0, -0.1321848],
                 {"ln_uacr": 0.1887974, "missing_uacr": 0.0916979}, -3.510705),
    },
    "hba1c": {
        "female": ([0.7858178, 0.0194438, -0.1521964, -0.2296681, 0.3465777, 0.5366241, 0.5411682, 0, 0,
                    0.5931898, 0.0472458, 0.3158567, -0.1535174, -0.0687752, 0.1054746, -0.0761119,
                    0.0307469, -0.0905966, -0.2241857, -0.080186, 0, -0.1667286],
                   {"hba1c_dm": 0.1338348, "hba1c_no_dm": 0.1622409, "missing_hba1c": -0.0142496}, -3.306162),
        "male": ([0.7699177, 0.0605093, -0.0888525, -0.417713, 0.3288657, 0.4759471, 0.4385663, 0, 0,
                  0.5334616, 0.0206431, 0.2917524, -0.1383313, -0.0482622, 0.1393796, -0.0463501,
                  0.0205926, -0.1037717, -0.1737697, -0.0915839, 0, -0.1637039],
                 {"hba1c_dm": 0.13159, "hba1c_no_dm": 0.1295185, "missing_hba1c": -0.0128373}, -3.040901),
    },
    "full": {
        "female": ([0.7716794, 0.0062109, -0.1547756, -0.1933123, 0.3071217, 0.496753, 0.466605, 0, 0,
                    0.4780697, 0.0529077, 0.3034892, -0.1556524, -0.0667026, 0.1061825, -0.0742271,
                    0.0288245, -0.0875188, -0.2267102, -0.0676125, 0, -0.1493231],
                   {"sdi_4_6": 0.1361989, "sdi_7_10": 0.2261596, "missing_sdi": 0.1804508,
                    "ln_uacr": 0.1645922, "missing_uacr": 0.0198413, "hba1c_dm": 0.1298513,
                    "hba1c_no_dm": 0.1412555, "missing_hba1c": -0.0031658}, -3.860385),
        "male": ([0.7847578, 0.0534485, -0.0911282, -0.4921973, 0.2972415, 0.4527054, 0.3726641, 0, 0,
                  0.3886854, 0.0081661, 0.2508052, -0.1538484, -0.0474695, 0.1415382, -0.0436455,
                  0.0199549, -0.1022686, -0.1762507, -0.0715873, 0, -0.1428668],
                 {"sdi_4_6": 0.0802431, "sdi_7_10": 0.275073, "missing_sdi": 0.144759,
                  "ln_uacr": 0.1772853, "missing_uacr": 0.1095674, "hba1c_dm": 0.1165698,
                  "hba1c_no_dm": 0.1048297, "missing_hba1c": -0.0230072}, -3.631387),
    },
}

# Inclusive valid ranges (preventr helpers). Out-of-range required inputs make PREVENT unavailable.
RANGES = {"age": (30, 79), "sbp": (90, 180), "total_chol": (130, 320), "hdl": (20, 100),
          "bmi": (18.5, 39.9), "egfr": (15, 140)}
OPTIONAL_RANGES = {"hba1c": (4.5, 15), "uacr": (0.1, 25000)}
_LABELS = {"age": "age", "sbp": "systolic BP", "total_chol": "total cholesterol", "hdl": "HDL",
           "bmi": "BMI", "egfr": "eGFR (creatinine)", "sex": "sex", "diabetes": "diabetes status",
           "smoking": "current smoking", "bp_tx": "BP medication", "statin": "cholesterol medication"}


def category(risk: float) -> str:
    """AHA PREVENT categories: low <5%, borderline 5-<7.5%, intermediate 7.5-<20%, high >=20%."""
    if risk < 0.05:
        return "low"
    if risk < 0.075:
        return "borderline"
    if risk < 0.20:
        return "intermediate"
    return "high"


def _in_range(value: Optional[float], bounds: tuple) -> bool:
    return value is not None and bounds[0] <= value <= bounds[1]


def ten_year_cvd(
    *, age: Optional[float], sex: Optional[str], total_chol: Optional[float], hdl: Optional[float],
    sbp: Optional[float], diabetes: Optional[bool], smoking: Optional[bool], bmi: Optional[float],
    egfr: Optional[float], bp_tx: Optional[bool], statin: Optional[bool],
    hba1c: Optional[float] = None, uacr: Optional[float] = None,
) -> Dict[str, Any]:
    """10-year total CVD risk (0-1). Cholesterol in mg/dL, eGFR in mL/min/1.73m2, UACR in mg/g."""
    values = {"age": age, "sbp": sbp, "total_chol": total_chol, "hdl": hdl, "bmi": bmi, "egfr": egfr}
    flags = {"sex": sex, "diabetes": diabetes, "smoking": smoking, "bp_tx": bp_tx, "statin": statin}
    # Out-of-range values are reported first: they rule PREVENT out whatever else is entered.
    out = [f"{_LABELS[k]} {values[k]:g} (valid {lo:g}-{hi:g})" for k, (lo, hi) in RANGES.items()
           if values[k] is not None and not _in_range(values[k], (lo, hi))]
    if out:
        result = {"available": False, "reason": "Outside the PREVENT validated range: " + "; ".join(out) + "."}
        if age is not None and not _in_range(age, RANGES["age"]):
            result["ageOutOfRange"] = True  # no validated 10-year equation exists for this age
        return result
    missing = [_LABELS[k] for k, v in {**values, **flags}.items() if v is None]
    if missing:
        return {"available": False, "reason": "Missing " + ", ".join(missing) + "."}
    if sex not in ("female", "male"):
        return {"available": False, "reason": "Missing sex."}

    hba1c = hba1c if _in_range(hba1c, OPTIONAL_RANGES["hba1c"]) else None
    uacr = uacr if _in_range(uacr, OPTIONAL_RANGES["uacr"]) else None
    if hba1c is not None and uacr is not None:
        model = "full"
    elif hba1c is not None:
        model = "hba1c"
    elif uacr is not None:
        model = "uacr"
    else:
        model = "base"

    a = (age - 55) / 10
    non_hdl = (total_chol - hdl) * MG_DL_TO_MMOL_L - 3.5
    h = (hdl * MG_DL_TO_MMOL_L - 1.3) / 0.3
    sbp_hi = (max(sbp, 110) - 130) / 20
    egfr_lo = (min(egfr, 60) - 60) / -15
    bmi_hi = (max(bmi, 30) - 30) / 5
    dm, smk, bp, st = float(diabetes), float(smoking), float(bp_tx), float(statin)
    terms = [a, non_hdl, h, (min(sbp, 110) - 110) / 20, sbp_hi, dm, smk, (min(bmi, 30) - 25) / 5, bmi_hi,
             egfr_lo, (max(egfr, 60) - 90) / -15, bp, st, bp * sbp_hi, st * non_hdl, a * non_hdl, a * h,
             a * sbp_hi, a * dm, a * smk, a * bmi_hi, a * egfr_lo]
    extra = {
        "ln_uacr": math.log(uacr) if uacr is not None else 0.0,
        "missing_uacr": 0.0 if uacr is not None else 1.0,
        "hba1c_dm": (hba1c - 5.3) * dm if hba1c is not None else 0.0,
        "hba1c_no_dm": (hba1c - 5.3) * (1 - dm) if hba1c is not None else 0.0,
        "missing_hba1c": 0.0 if hba1c is not None else 1.0,
        "sdi_4_6": 0.0, "sdi_7_10": 0.0, "missing_sdi": 1.0,
    }
    betas, extra_betas, constant = _COEF[model][sex]
    x = constant + sum(b * t for b, t in zip(betas, terms)) + sum(b * extra[k] for k, b in extra_betas.items())
    risk = math.exp(x) / (1 + math.exp(x))
    return {"available": True, "risk": risk, "category": category(risk), "model": model}


def _value(row: Dict[str, Any], column: str) -> Optional[float]:
    value = row.get(column)
    if value is None:
        return None
    value = float(value)
    return None if math.isnan(value) else value


def from_raw(row: Dict[str, Any]) -> Dict[str, Any]:
    """PREVENT from a raw NHANES-coded row (ml.inference.build_raw_row / the NHANES datasets)."""
    age, sex_code = _value(row, "RIDAGEYR"), _value(row, "RIAGENDR")
    sex = {1.0: "male", 2.0: "female"}.get(sex_code)
    creatinine = _value(row, "LBXSCR")
    egfr = None
    if creatinine is not None and age is not None and sex is not None:
        egfr = float(ckd_epi_2021(pd.Series([creatinine]), pd.Series([age]),
                                  pd.Series([1.0 if sex == "male" else 0.0])).iloc[0])
    yes = lambda column: {1.0: True, 2.0: False}.get(_value(row, column))  # noqa: E731
    smoking = {1.0: True, 2.0: True, 3.0: False}.get(_value(row, "SMQ040"))
    if smoking is None and yes("SMQ020") is False:
        smoking = False
    bp_tx = yes("BPQ150")
    if bp_tx is None and yes("BPQ020") is False:
        bp_tx = False
    diabetes = {1.0: True, 2.0: False, 3.0: False}.get(_value(row, "DIQ010"))
    inputs = dict(
        age=age, sex=sex, total_chol=_value(row, "LBXTC"), hdl=_value(row, "LBDHDD"), sbp=_value(row, "BPXOSY1"),
        diabetes=diabetes, smoking=smoking, bmi=_value(row, "BMXBMI"), egfr=egfr, bp_tx=bp_tx,
        statin=yes("BPQ101D"), hba1c=_value(row, "LBXGH"), uacr=_value(row, "URDACT"),
    )
    result = ten_year_cvd(**inputs)
    if result["available"]:
        result = {**result, "risk": round(result["risk"], 4), "egfr": round(egfr, 1)}
        if THIRTY_YEAR_AGES[0] <= age <= THIRTY_YEAR_AGES[1]:
            thirty = thirty_year_cvd(**inputs)
            result.update(risk30=round(thirty["risk"], 4), model30=thirty["model"])
    return result


# --- 30-year total CVD ------------------------------------------------------------------------
# Published 30-year total-CVD equations (same paper), cross-checked against preventr and
# PooledCohort; they add an age-squared term. The authors recommend 30-year estimates for ages
# 30-59 only (preventr warns above 59), so the app shows them only in that range.
THIRTY_YEAR_AGES = (30, 59)

_COEF_30: Dict[str, Dict[str, Dict[str, float]]] = {
    "base": {
        "female": dict(age=0.5503079, age_sq=-0.0928369, non_hdl=0.0409794, hdl=-0.1663306, sbp_lt_110=-0.1628654,
                       sbp_gte_110=0.3299505, dm=0.6793894, smoking=0.3196112, egfr_lt_60=0.1857101,
                       egfr_gte_60=0.0553528, bp_tx=0.2894, statin=-0.075688, bp_tx_sbp=-0.056367,
                       statin_non_hdl=0.1071019, age_non_hdl=-0.0751438, age_hdl=0.0301786, age_sbp=-0.0998776,
                       age_dm=-0.3206166, age_smoking=-0.1607862, age_egfr_lt_60=-0.1450788, constant=-1.318827),
        "male": dict(age=0.4627309, age_sq=-0.0984281, non_hdl=0.0836088, hdl=-0.1029824, sbp_lt_110=-0.2140352,
                     sbp_gte_110=0.2904325, dm=0.5331276, smoking=0.2141914, egfr_lt_60=0.1155556,
                     egfr_gte_60=0.0603775, bp_tx=0.232714, statin=-0.0272112, bp_tx_sbp=-0.0384488,
                     statin_non_hdl=0.134192, age_non_hdl=-0.0511759, age_hdl=0.0165865, age_sbp=-0.1101437,
                     age_dm=-0.2585943, age_smoking=-0.1566406, age_egfr_lt_60=-0.1166776, constant=-1.148204),
    },
    "uacr": {
        "female": dict(age=0.5491768, age_sq=-0.0937311, non_hdl=0.0359847, hdl=-0.1642965, sbp_lt_110=-0.1483404,
                       sbp_gte_110=0.313353, dm=0.6253766, smoking=0.3147172, egfr_lt_60=0.1094663,
                       egfr_gte_60=0.0550705, bp_tx=0.2782433, statin=-0.0786239, bp_tx_sbp=-0.0628947,
                       statin_non_hdl=0.093204, age_non_hdl=-0.0710685, age_hdl=0.0306363, age_sbp=-0.0951455,
                       age_dm=-0.3168231, age_smoking=-0.1636391, age_egfr_lt_60=-0.1265483,
                       ln_uacr=0.1142251, missing_uacr=-0.0055863, constant=-1.583738),
        "male": dict(age=0.464491, age_sq=-0.0998895, non_hdl=0.0757606, hdl=-0.1031778, sbp_lt_110=-0.1990714,
                     sbp_gte_110=0.2715816, dm=0.4754637, smoking=0.2069672, egfr_lt_60=0.0331103,
                     egfr_gte_60=0.0540474, bp_tx=0.2189911, statin=-0.0331044, bp_tx_sbp=-0.04534,
                     statin_non_hdl=0.1214535, age_non_hdl=-0.0483995, age_hdl=0.0178997, age_sbp=-0.1059324,
                     age_dm=-0.2492861, age_smoking=-0.1561543, age_egfr_lt_60=-0.1012429,
                     ln_uacr=0.1007571, missing_uacr=0.0572456, constant=-1.398727),
    },
    "hba1c": {
        "female": dict(age=0.5343493, age_sq=-0.0952314, non_hdl=0.0298124, hdl=-0.1578451, sbp_lt_110=-0.1504488,
                       sbp_gte_110=0.3173368, dm=0.4314738, smoking=0.3209399, egfr_lt_60=0.1771435,
                       egfr_gte_60=0.0582828, bp_tx=0.2888947, statin=-0.0795886, bp_tx_sbp=-0.0600438,
                       statin_non_hdl=0.0920598, age_non_hdl=-0.0696108, age_hdl=0.0308807, age_sbp=-0.0954051,
                       age_dm=-0.2763408, age_smoking=-0.1623944, age_egfr_lt_60=-0.1430514,
                       hba1c_dm=0.0940543, hba1c_no_dm=0.1116486, missing_hba1c=-0.0024798, constant=-1.341059),
        "male": dict(age=0.4519873, age_sq=-0.101624, non_hdl=0.0700456, hdl=-0.0968005, sbp_lt_110=-0.1923527,
                     sbp_gte_110=0.2827043, dm=0.3417152, smoking=0.2105272, egfr_lt_60=0.1113291,
                     egfr_gte_60=0.0640135, bp_tx=0.2334248, statin=-0.0299421, bp_tx_sbp=-0.0393204,
                     statin_non_hdl=0.1228854, age_non_hdl=-0.0463737, age_hdl=0.0184599, age_sbp=-0.1085744,
                     age_dm=-0.2208049, age_smoking=-0.1577978, age_egfr_lt_60=-0.1179375,
                     hba1c_dm=0.0768169, hba1c_no_dm=0.0777295, missing_hba1c=0.0092204, constant=-1.180767),
    },
}


def thirty_year_cvd(
    *, age: float, sex: str, total_chol: float, hdl: float, sbp: float, diabetes: bool, smoking: bool,
    bmi: float, egfr: float, bp_tx: bool, statin: bool, hba1c: Optional[float] = None, uacr: Optional[float] = None,
) -> Dict[str, Any]:
    """30-year total CVD risk (0-1). Call only with inputs that already passed ten_year_cvd's checks."""
    hba1c = hba1c if _in_range(hba1c, OPTIONAL_RANGES["hba1c"]) else None
    uacr = uacr if _in_range(uacr, OPTIONAL_RANGES["uacr"]) else None
    # No 30-year model with both optional terms is used here: HbA1c takes precedence over UACR.
    model = "hba1c" if hba1c is not None else "uacr" if uacr is not None else "base"
    a = (age - 55) / 10
    non_hdl = (total_chol - hdl) * MG_DL_TO_MMOL_L - 3.5
    h = (hdl * MG_DL_TO_MMOL_L - 1.3) / 0.3
    sbp_hi = (max(sbp, 110) - 130) / 20
    egfr_lo = (min(egfr, 60) - 60) / -15
    dm, smk, bp, st = float(diabetes), float(smoking), float(bp_tx), float(statin)
    terms = dict(
        age=a, age_sq=a * a, non_hdl=non_hdl, hdl=h, sbp_lt_110=(min(sbp, 110) - 110) / 20, sbp_gte_110=sbp_hi,
        dm=dm, smoking=smk, egfr_lt_60=egfr_lo, egfr_gte_60=(max(egfr, 60) - 90) / -15, bp_tx=bp, statin=st,
        bp_tx_sbp=bp * sbp_hi, statin_non_hdl=st * non_hdl, age_non_hdl=a * non_hdl, age_hdl=a * h,
        age_sbp=a * sbp_hi, age_dm=a * dm, age_smoking=a * smk, age_egfr_lt_60=a * egfr_lo, constant=1.0,
        ln_uacr=math.log(uacr) if uacr is not None else 0.0, missing_uacr=0.0 if uacr is not None else 1.0,
        hba1c_dm=(hba1c - 5.3) * dm if hba1c is not None else 0.0,
        hba1c_no_dm=(hba1c - 5.3) * (1 - dm) if hba1c is not None else 0.0,
        missing_hba1c=0.0 if hba1c is not None else 1.0,
    )
    x = sum(beta * terms[name] for name, beta in _COEF_30[model][sex].items())
    return {"risk": math.exp(x) / (1 + math.exp(x)), "model": model}
