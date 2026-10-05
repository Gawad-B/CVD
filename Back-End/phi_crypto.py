"""Application-layer encryption for patient identifiers (AES-256-GCM).

The key never reaches the database: values are encrypted/decrypted here and the
DB only stores opaque BYTEA. Format: b"v1" + 12-byte nonce + GCM ciphertext/tag.

Every value is bound to its location via GCM associated data (use phi_aad()):
a ciphertext copied to another patient or another column fails to decrypt.
"""
import os
from functools import lru_cache
from typing import Any, Optional, Union

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

MIN_KEY_LENGTH = 16
_VERSION = b"v1"
_NONCE_LEN = 12
_HKDF_INFO = b"cardio-phi-v1"


class PhiDecryptionError(Exception):
    """Wrong key or corrupt/unsupported ciphertext (message never includes secrets)."""


def load_key(raw: Optional[str] = None) -> str:
    """Return PATIENT_DATA_KEY (from env unless given); raise RuntimeError if unusable."""
    key = os.getenv("PATIENT_DATA_KEY", "") if raw is None else raw
    if len(key) < MIN_KEY_LENGTH:
        raise RuntimeError("PATIENT_DATA_KEY must be set (min 16 chars)")
    return key


@lru_cache(maxsize=4)
def _derive(secret: str) -> AESGCM:
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_HKDF_INFO).derive(secret.encode("utf-8"))
    return AESGCM(key)


def _aesgcm(key: Optional[str]) -> AESGCM:
    return _derive(load_key(key))


def phi_aad(patient_id: Any, field: str) -> bytes:
    """Associated data binding a ciphertext to one patient and one column."""
    return f"{patient_id}:{field}".encode("utf-8")


def encrypt_text(value: Optional[str], key: Optional[str] = None, *, aad: bytes) -> Optional[bytes]:
    if value is None:
        return None
    nonce = os.urandom(_NONCE_LEN)
    return _VERSION + nonce + _aesgcm(key).encrypt(nonce, value.encode("utf-8"), aad)


def decrypt_text(blob: Union[bytes, memoryview, None], key: Optional[str] = None, *, aad: bytes) -> Optional[str]:
    if blob is None:
        return None
    data = bytes(blob)
    if not data.startswith(_VERSION) or len(data) < len(_VERSION) + _NONCE_LEN + 16:
        raise PhiDecryptionError("Encrypted patient data is corrupt or in an unsupported format")
    nonce = data[len(_VERSION):len(_VERSION) + _NONCE_LEN]
    try:
        return _aesgcm(key).decrypt(nonce, data[len(_VERSION) + _NONCE_LEN:], aad).decode("utf-8")
    except (InvalidTag, UnicodeDecodeError):
        raise PhiDecryptionError("Cannot decrypt patient data: wrong PATIENT_DATA_KEY or corrupt data") from None
