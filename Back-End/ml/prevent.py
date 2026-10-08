"""AHA PREVENT 10-year total CVD risk (Khan SS et al., Circulation 2024;149:430-449).

Coefficients are the published 10-year total-CVD equations, cross-checked against two independent
implementations (R package preventr and bcjaeger/PooledCohort). Model choice follows preventr:
base model, + UACR, + HbA1c, or the full model (UACR and HbA1c, social deprivation index missing).

Valid only for ages 30-79 and in-range inputs; anything else returns `available: False` with a
reason rather than an extrapolated number.
"""
import math
from typing import Any, Dict, Optional

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
        return {"available": False, "reason": "Outside the PREVENT validated range: " + "; ".join(out) + "."}
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
