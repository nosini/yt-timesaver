#!/usr/bin/env python3
"""
YT TimeSaver – packer

Packs the extension into a signed CRX3 file. Only the `openssl` command line
is needed; no browser and no Python packages.

The container is documented in Chromium's components/crx_file/crx3.proto and
crx_verifier.cc:

    "Cr24" | uint32 version (3) | uint32 header length | header | zip

The header is a CrxFileHeader protobuf holding the RSA public key, the
signature, and a SignedData message carrying the 16-byte extension ID. The
signature covers a fixed context string, the SignedData block, and the zip.

The extension ID is derived from the signing key, so the key is never created
here: a missing key is an error rather than a silently different extension.
"""

import hashlib
import io
import struct
import subprocess
import sys
import zipfile
from pathlib import Path

HERE    = Path(__file__).parent.resolve()
NAME    = "yt-timesaver"
OUT_CRX = HERE / f"{NAME}.crx"
KEY_PEM = HERE / f"{NAME}.pem"

INCLUDE = [
    "manifest.json",
    "content.js",
    "popup.html",
    "popup.js",
    "icon.png",
]

# crx_verifier.cc prepends this to the signed payload so a signature made for
# one purpose cannot be replayed as a CRX signature.
SIGNATURE_CONTEXT = b"CRX3 SignedData\x00"

# Every entry gets the same timestamp so packing unchanged sources gives
# byte-identical output. Zip timestamps start at 1980.
FIXED_TIMESTAMP = (1980, 1, 1, 0, 0, 0)

USAGE = f"""Usage: pack.py [key.pem] [output.crx]
       pack.py --id [key.pem]

Packs and signs the extension and prints its extension ID. The key defaults
to {KEY_PEM.name} and the output to {OUT_CRX.name}, both next to this script.
With --id, only prints the ID the key produces."""


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


def openssl(args, stdin=b""):
    result = subprocess.run(
        ["openssl", *args], input=stdin, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    if result.returncode != 0:
        message = result.stderr.decode("utf-8", "replace").strip()
        raise RuntimeError(f"openssl {args[0]} failed: {message}")
    return result.stdout


def public_key_der(key_file: Path) -> bytes:
    return openssl(["rsa", "-in", str(key_file), "-passin", "pass:", "-pubout", "-outform", "DER"])


def extension_id(public_key: bytes) -> str:
    # Chromium shows the first 16 bytes of the key's SHA-256, hex digits mapped to a-p.
    digest = hashlib.sha256(public_key).digest()[:16]
    return digest.hex().translate(str.maketrans("0123456789abcdef", "abcdefghijklmnop"))


def build_zip() -> bytes:
    missing = [f for f in INCLUDE if not (HERE / f).is_file()]
    if missing:
        raise RuntimeError(f"missing files: {', '.join(missing)}")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name in INCLUDE:
            info = zipfile.ZipInfo(name, FIXED_TIMESTAMP)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            zf.writestr(info, (HERE / name).read_bytes())
    return buf.getvalue()


def build_crx3(zip_bytes: bytes, key_file: Path, public_key: bytes) -> bytes:
    # SignedData { bytes crx_id = 1 }
    signed_header = pb_bytes(1, hashlib.sha256(public_key).digest()[:16])
    signature = openssl(
        ["dgst", "-sha256", "-sign", str(key_file), "-passin", "pass:"],
        SIGNATURE_CONTEXT + struct.pack("<I", len(signed_header)) + signed_header + zip_bytes,
    )
    # AsymmetricKeyProof { bytes public_key = 1; bytes signature = 2 }
    proof = pb_bytes(1, public_key) + pb_bytes(2, signature)
    # CrxFileHeader { repeated AsymmetricKeyProof sha256_with_rsa = 2;
    #                 bytes signed_header_data = 10000 }
    crx_header = pb_bytes(2, proof) + pb_bytes(10000, signed_header)
    return b"Cr24" + struct.pack("<II", 3, len(crx_header)) + crx_header + zip_bytes


def main(argv):
    args = argv[1:]
    id_only = args[:1] == ["--id"]
    if id_only:
        args = args[1:]
    if len(args) > (1 if id_only else 2) or any(a.startswith("-") for a in args):
        print(USAGE, file=sys.stderr)
        return 2

    key_file = Path(args[0]) if args else KEY_PEM
    out_crx = Path(args[1]) if len(args) > 1 else OUT_CRX
    if not key_file.is_file():
        print(f"pack.py: signing key not found: {key_file}", file=sys.stderr)
        return 1

    try:
        public_key = public_key_der(key_file)
        if not id_only:
            out_crx.write_bytes(build_crx3(build_zip(), key_file, public_key))
    except (RuntimeError, OSError) as error:
        print(f"pack.py: {error}", file=sys.stderr)
        return 1
    print(extension_id(public_key))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
