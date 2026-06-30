# Tools

## Windows Release

`pc_release.py` builds the Tauri NSIS installer, copies release artifacts to `tools/dist/pc_release`, creates `latest.json`, and can upload the installer, signature, and manifest to Aliyun OSS.

```powershell
python -m pip install -r tools/requirements.txt
Copy-Item tools/pc_release.env.example tools/pc_release.env
```

Generate an updater signing key:

```powershell
npm exec -w @lockpass/desktop tauri signer generate -- --write-keys "$env:USERPROFILE\.tauri\lockpass.key" --ci --force
```

Build locally:

```powershell
python tools/pc_release.py --channel web --platform windows-x86_64
```

Upload to OSS:

```powershell
python tools/pc_release.py --channel web --platform windows-x86_64 --upload --notes "Release notes"
```

Useful options:

```text
--channel     Required release channel, for example web.
--platform    Required Tauri updater platform key, for example windows-x86_64.
--upload      Upload installer, signature, and latest.json.
--notes       Override RELEASE_NOTES for latest.json.
```

The script always rebuilds the desktop installer before collecting artifacts. Release files are uploaded under:

```text
<OSS_APPS_DIR>/<Tauri identifier>/<channel>/<platform>/
```

Uploads overwrite existing OSS objects by default.

Advanced settings such as signing key path, OSS app directory, bucket, endpoint, and public URL live in `tools/pc_release.env`. To use another env file, set:

```powershell
$env:LOCKPASS_RELEASE_ENV = "tools\pc_release.prod.env"
```

Upload cache policy:

```text
installer / .sig  Cache-Control: public, max-age=31536000, immutable
latest.json       Cache-Control: no-cache
```
