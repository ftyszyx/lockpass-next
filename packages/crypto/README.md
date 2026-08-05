# @lockpass/crypto

Shared client-side cryptography for LockPass desktop, web, and browser-extension clients.

- Instantiate one `WebVaultCryptoProvider` in the trusted application context.
- Desktop runs it in the Tauri WebView.
- A browser extension runs it in its background or offscreen context.
- UI components, popups, and content scripts pass `sessionId` values instead of key bytes.
- OS secure storage and user-presence checks stay behind platform-specific adapters.

`sessionId` is an application module boundary, not an operating-system security boundary. Code running in the same trusted JavaScript context can still call the provider.
