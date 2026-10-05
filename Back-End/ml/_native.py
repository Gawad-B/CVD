"""Import lightgbm, falling back to the vendored libgomp when the system has none."""
import ctypes
import importlib
from pathlib import Path

VENDORED_LIBGOMP = Path(__file__).resolve().parent.parent / "vendor" / "libgomp.so.1"


def import_lightgbm():
    try:
        return importlib.import_module("lightgbm")
    except OSError as exc:
        if "libgomp" not in str(exc):
            raise
    ctypes.CDLL(str(VENDORED_LIBGOMP), mode=ctypes.RTLD_GLOBAL)
    return importlib.import_module("lightgbm")
