import ctypes
import types

import pytest

from ml import _native

pytestmark = pytest.mark.nodb


def test_retries_with_vendored_libgomp(monkeypatch):
    calls = {"import": 0}
    sentinel = types.SimpleNamespace(name="lightgbm")

    def fake_import(name):
        calls["import"] += 1
        if calls["import"] == 1:
            raise OSError("libgomp.so.1: cannot open shared object file: No such file or directory")
        return sentinel

    loaded = []
    monkeypatch.setattr(_native.importlib, "import_module", fake_import)
    monkeypatch.setattr(_native.ctypes, "CDLL", lambda path, mode=0: loaded.append((path, mode)))
    assert _native.import_lightgbm() is sentinel
    assert loaded == [(str(_native.VENDORED_LIBGOMP), ctypes.RTLD_GLOBAL)]
    assert _native.VENDORED_LIBGOMP.name == "libgomp.so.1"


def test_other_oserror_reraises(monkeypatch):
    def fake_import(name):
        raise OSError("something else")

    monkeypatch.setattr(_native.importlib, "import_module", fake_import)
    with pytest.raises(OSError, match="something else"):
        _native.import_lightgbm()


def test_vendored_file_exists():
    assert _native.VENDORED_LIBGOMP.is_file()
