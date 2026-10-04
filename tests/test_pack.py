import hashlib
import io
import struct
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import pack  # noqa: E402


def parse_fields(data):
    """Parse length-delimited protobuf fields into {field number: [payload]}."""
    fields = {}
    position = 0
    while position < len(data):
        key, position = read_varint(data, position)
        if key & 0x07 != 2:
            raise AssertionError(f"unexpected wire type {key & 0x07}")
        length, position = read_varint(data, position)
        fields.setdefault(key >> 3, []).append(data[position:position + length])
        position += length
    return fields


def read_varint(data, position):
    value = shift = 0
    while True:
        byte = data[position]
        position += 1
        value |= (byte & 0x7F) << shift
        if not byte & 0x80:
            return value, position
        shift += 7


class PackTests(unittest.TestCase):
    def setUp(self):
        workspace = tempfile.TemporaryDirectory()
        self.addCleanup(workspace.cleanup)
        self.directory = Path(workspace.name)
        # A throwaway key that only exists for the duration of the test.
        self.key = self.directory / "test.pem"
        subprocess.run(
            ["openssl", "genrsa", "-out", str(self.key), "2048"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        self.crx = self.directory / "packed.crx"

    def run_cli(self, *arguments):
        return subprocess.run(
            [sys.executable, str(Path(pack.__file__)), *map(str, arguments)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )

    def pack(self):
        result = self.run_cli(self.key, self.crx)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = self.crx.read_bytes()
        self.assertEqual(data[:4], b"Cr24")
        version, header_size = struct.unpack("<II", data[4:12])
        self.assertEqual(version, 3)
        header = parse_fields(data[12:12 + header_size])
        return result.stdout.strip(), header, data[12 + header_size:]

    def test_signature_verifies_over_context_header_and_archive(self):
        _, header, archive = self.pack()
        proof = parse_fields(header[2][0])
        public_key, signature = proof[1][0], proof[2][0]
        signed_header = header[10000][0]

        (self.directory / "public.der").write_bytes(public_key)
        (self.directory / "signature.bin").write_bytes(signature)
        verified = subprocess.run(
            ["openssl", "dgst", "-sha256", "-verify", str(self.directory / "public.der"),
             "-keyform", "DER", "-signature", str(self.directory / "signature.bin")],
            input=pack.SIGNATURE_CONTEXT + struct.pack("<I", len(signed_header))
            + signed_header + archive,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE,
        )
        self.assertEqual(verified.returncode, 0, verified.stderr.decode())

    def test_crx_id_and_printed_id_derive_from_the_key(self):
        printed, header, _ = self.pack()
        public_key = parse_fields(header[2][0])[1][0]
        self.assertEqual(public_key, pack.public_key_der(self.key))
        crx_id = parse_fields(header[10000][0])[1][0]
        self.assertEqual(crx_id, hashlib.sha256(public_key).digest()[:16])
        self.assertEqual(printed, pack.extension_id(public_key))
        self.assertRegex(printed, r"^[a-p]{32}$")

        result = self.run_cli("--id", self.key)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(), printed)

    def test_archive_holds_exactly_the_extension_files(self):
        _, _, archive = self.pack()
        with zipfile.ZipFile(io.BytesIO(archive)) as packed:
            self.assertIsNone(packed.testzip())
            self.assertEqual(packed.namelist(), pack.INCLUDE)
            for name in pack.INCLUDE:
                self.assertEqual(packed.read(name), (pack.HERE / name).read_bytes())

    def test_repeated_packs_are_byte_identical(self):
        self.pack()
        first = self.crx.read_bytes()
        self.pack()
        self.assertEqual(first, self.crx.read_bytes())

    def test_missing_or_broken_key_fails_without_creating_one(self):
        missing = self.directory / "missing.pem"
        broken = self.directory / "broken.pem"
        broken.write_text("not a key\n")
        cases = [
            (("--id", missing), "signing key not found"),
            ((missing, self.crx), "signing key not found"),
            ((broken, self.crx), "openssl rsa"),
        ]
        for arguments, expected in cases:
            with self.subTest(arguments=arguments):
                result = self.run_cli(*arguments)
                self.assertEqual(result.returncode, 1)
                self.assertIn(expected, result.stderr)
                self.assertNotIn("Traceback", result.stderr)
                self.assertEqual(result.stdout, "")
                self.assertFalse(missing.exists())
                self.assertFalse(self.crx.exists())

    def test_bad_usage_prints_help(self):
        for arguments in (("--id", "a", "b"), ("a", "b", "c"), ("--zip",)):
            with self.subTest(arguments=arguments):
                result = self.run_cli(*arguments)
                self.assertEqual(result.returncode, 2)
                self.assertIn("Usage:", result.stderr)


if __name__ == "__main__":
    unittest.main()
