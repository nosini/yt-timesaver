# Development

To try changes, choose **Load unpacked** on the browser's extensions page (with
Developer mode on) and select the repository folder. After editing, click the
extension's reload button there and reload the YouTube tab.

## Building

`pack.py` packs the extension into a signed CRX3 file. It needs Python 3 and the
`openssl` command line, nothing else:

```sh
./pack.py path/to/key.pem             # writes yt-timesaver.crx, prints the ID
./pack.py --id path/to/key.pem        # only prints the extension ID
```

The extension ID is derived from the key, so the same key must sign every
release. `pack.py` never creates a key; without one it stops with an error.
Packing unchanged sources gives byte-identical output.

The tests need Node.js 22 and Python 3:

```sh
node --test tests/*.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
```

## Releases

[The workflow](../.github/workflows/pack.yml) runs the tests, signs the package
and attaches `yt-timesaver.crx` to a GitHub release. It runs on tags starting
with `v`, and on manual runs of `main`, which leave the package as a workflow
artifact for 30 days instead. A release tag must be `v` followed by the
`version` in `manifest.json` (for example `v1.1` for `"version": "1.1"`); the
workflow refuses any other tag. Bump the version, commit, then tag.

Re-running the workflow for a tag replaces the attached package instead of
adding a second one. Releases use the run's own `GITHUB_TOKEN`, so no personal
access token is needed.

## Signing key

The key is a 2048-bit RSA private key in PEM format, for example from
`openssl genrsa -out yt-timesaver.pem 2048`. Keep it outside the repository and
keep a backup: it is the only way to publish updates under the same extension
ID.

The workflow reads the key from a repository Actions secret named
`EXTENSION_KEY_B64`, holding the key encoded as one line of base64. Write the
encoded key to a file and copy the file's contents into the secret, rather than
copying it from the terminal, where long lines can get cut off:

```sh
base64 -w 0 < yt-timesaver.pem > key.b64
```

Or set it directly with the GitHub CLI:

```sh
base64 -w 0 < yt-timesaver.pem | gh secret set EXTENSION_KEY_B64 --repo nosini/yt-timesaver
```

`EXPECTED_EXTENSION_ID` in the workflow must be the ID that `./pack.py --id`
prints for the key. The workflow refuses to sign with a key that gives any
other ID, and fails when the secret is missing or is not an unencrypted RSA
key, so a release can never come out as a different extension.

Only the signing step sees the key. It decodes it into a private temporary
directory outside the checkout and deletes that directory when the step ends,
including on failure or cancellation. Only the `.crx` is uploaded. Code that
can sign with the key can also read it, so review changes to the workflow and
to `pack.py`, and keep signing out of pull-request workflows.
