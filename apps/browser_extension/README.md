# LockPass Chrome Extension

The extension is an independent LockPass client. It does not require the Desktop application.

Copy `.env.example` to `.env` and configure the official Web and API URLs before building. The build fails when either URL is missing or invalid.

## Development

```powershell
npm run dev:extension
```

This builds the real extension into `apps/browser_extension/dist` and watches its source files. Load that directory from `chrome://extensions`; after a rebuild, use the extension card's reload button before testing again.

No browser-hosted UI or sample vault data is provided. Account, storage, permission, popup and content-script behavior always runs inside the Chrome extension runtime.

## Build and load in Chrome

```powershell
npm run build:extension
```

Open `chrome://extensions`, enable developer mode, choose **Load unpacked**, and select `apps/browser_extension/dist`.

Clicking the extension action opens the vault popup. The extension requests website access only when the user enables inline filling from the popup.

## Package for Chrome Web Store

Copy `.env.production.example` to `.env.production` and replace both example
URLs with the production HTTPS user Web/API origin. Store packaging rejects
localhost and non-HTTPS addresses.

Update the version in this directory's `package.json`, then run from the
repository root:

```powershell
npm run package:extension
```

The upload-ready ZIP is written to:

```text
tools/dist/browser_extension/lockpass-browser-extension-v<version>.zip
```

Upload that ZIP directly. Its root contains `manifest.json`; do not wrap the
`dist` directory in another folder and do not upload the source directory.
