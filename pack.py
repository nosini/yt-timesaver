#!/usr/bin/env python3
"""
YT TimeSaver – packer
Produces a self-signed .crx (CRX3) and a .zip with no external tools needed.
Requires: pip install cryptography

Output files are saved in the same folder as this script.
"""

import hashlib
import io
import struct
import sys
import zipfile
from pathlib import Path

try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa, padding
    from cryptography.hazmat.backends import default_backend
except ImportError:
    sys.exit("Missing dependency. Run:  pip install cryptography")

HERE    = Path(__file__).parent.resolve()
NAME    = "yt-timesaver"
OUT_CRX = HERE / f"{NAME}.crx"
OUT_ZIP = HERE / f"{NAME}.zip"
KEY_PEM = HERE / f"{NAME}.pem"

INCLUDE = [
    "manifest.json",
    "content.js",
    "popup.html",
    "popup.js",
    "icon.png",
]

def varint(n):
    out = []
    while True:
        bits = n & 0x7F
        n >>= 7
        out.append(bits | (0x80 if n else 0))
        if not n:
            return bytes(out)

def pb_bytes(field, data: bytes) -> bytes:
    return varint((field << 3) | 2) + varint(len(data)) + data

def build_crx3(zip_bytes: bytes, private_key) -> bytes:
    public_key_der = private_key.public_key().public_bytes(
        serialization.Encoding.DER,
        serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    crx_id = hashlib.sha256(public_key_der).digest()[:16]
    signed_header = pb_bytes(1, crx_id)
    sign_payload = (
        b"CRX3 SignedData\x00"
        + struct.pack("<I", len(signed_header))
        + signed_header
        + zip_bytes
    )
    signature = private_key.sign(sign_payload, padding.PKCS1v15(), hashes.SHA256())
    proof = pb_bytes(1, public_key_der) + pb_bytes(2, signature)
    crx_header = pb_bytes(2, proof) + pb_bytes(10000, signed_header)
    return (
        b"Cr24"
        + struct.pack("<I", 3)
        + struct.pack("<I", len(crx_header))
        + crx_header
        + zip_bytes
    )

def load_or_create_key():
    if KEY_PEM.exists():
        print(f"   Using existing key: {KEY_PEM.name}")
        with open(KEY_PEM, "rb") as f:
            return serialization.load_pem_private_key(f.read(), password=None)
    print("   Generating new RSA-2048 key...")
    key = rsa.generate_private_key(
        public_exponent=65537, key_size=2048, backend=default_backend()
    )
    KEY_PEM.write_bytes(key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    print(f"   Saved → {KEY_PEM.name}  (keep this to preserve the extension ID)")
    return key

def main():
    missing = [f for f in INCLUDE if not (HERE / f).exists()]
    if missing:
        sys.exit(f"Missing files: {', '.join(missing)}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            zf.write(HERE / name, name)
            print(f"  + {name}")
    zip_bytes = buf.getvalue()

    OUT_ZIP.write_bytes(zip_bytes)
    print(f"\n📦 ZIP → {OUT_ZIP.name}  ({len(zip_bytes):,} bytes)")

    print("🔑 Key:")
    key = load_or_create_key()
    crx_bytes = build_crx3(zip_bytes, key)
    OUT_CRX.write_bytes(crx_bytes)
    print(f"✅  CRX → {OUT_CRX.name}  ({len(crx_bytes):,} bytes)")

    print("\nInstall:")
    print("  Drag the .crx onto brave://extensions or chrome://extensions (Dev mode on)")

if __name__ == "__main__":
    main()
