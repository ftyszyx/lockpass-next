# Tools

## PC Release

`pc_release.py` builds one release platform at a time, creates a single-platform Tauri updater `latest.json`, and can upload that platform's artifacts to Aliyun OSS.

```powershell
python -m pip install -r tools/requirements.txt
Copy-Item tools/pc_release.env.example tools/pc_release.env
```

Generate an updater signing key:

```powershell
npm exec -w @lockpass/desktop tauri signer generate -- --write-keys "$env:USERPROFILE\.tauri\lockpass.key" --ci --force
```
Signing configuration distinguishes private and public keys explicitly:

```text
TAURI_SIGNING_PRIVATE_KEY_PASSWORD=
TAURI_SIGNING_PRIVATE_KEY=
TAURI_SIGNING_PUBLIC_KEY=
LOCKPASS_SIGNING_PRIVATE_KEY_PATH=tools/keys/lockpass.key
LOCKPASS_SIGNING_PUBLIC_KEY_PATH=tools/keys/lockpass.key.pub
```

Build locally:

```powershell
python tools/pc_release.py --channel web --platform windows-x86_64
```

Build a standalone Chrome Web Store package:

```powershell
python tools/pc_release.py --channel web --platform chrome-store
```

Upload to OSS:

```powershell
python tools/pc_release.py --channel web --platform windows-x86_64 --upload --notes "Release notes"
```

Upload the Chrome Store package to the configured OSS release directory:

```powershell
python tools/pc_release.py --channel web --platform chrome-store --upload
```

Useful options:

```text
--channel     Required release channel, for example web.
--platform    Required release platform: windows-x86_64 or chrome-store.
--upload      Upload the selected platform artifacts to OSS.
--notes       Override RELEASE_NOTES for desktop latest.json.
```


Set the release version in `tools/pc_release.env` with a semantic version tag:

```text
RELEASE_TAG=v0.1.3
```

The version parsed from `RELEASE_TAG` is synchronized only to the selected platform. Desktop builds update the desktop app, Rust crate, Tauri config, and `latest.json`. `chrome-store` builds update the browser extension package and generated manifest without building or signing the desktop app.

Each desktop platform publishes its own updater manifest:

```text
apps/com.lockpass.next/<channel>/<platform>/latest.json
```

The manifest contains top-level `channel`, `platform`, `url`, and `signature` fields. It does not contain a multi-platform `platforms` object.

Chrome Store builds require production HTTPS addresses:

```text
VITE_LOCKPASS_OFFICIAL_SERVER_URL=https://your-domain.example
VITE_LOCKPASS_OFFICIAL_API_URL=https://your-domain.example
```

Desktop artifacts are written to `tools/dist/pc_release`. Chrome Store packages are written separately to `tools/dist/pc_release/chrome-store/lockpass-browser-extension-v0.1.3.zip` and use the OSS platform prefix `chrome-store`.
