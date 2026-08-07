# Chrome Web Store Assets

Upload the files to these Chrome Web Store fields:

| Store field | File |
| --- | --- |
| Store icon | `store-icon-128.png` |
| Localized screenshot (Chinese) | `screenshot-zh-CN-1280x800.png` |
| Global screenshot (English) | `screenshot-en-US-1280x800.png` |
| Small promo tile | `promo-small-440x280.png` |
| Marquee promo tile | `promo-marquee-1400x560.png` |

The screenshots use sanitized example accounts and domains. They do not contain local vault or account data.

Regenerate the localized screenshots from the repository root:

```powershell
python tools/generate_browser_store_screenshots.py
```

## Chrome Web Store Review Copy

### Single purpose

> 在用户授权的网站登录表单中，从其 LockPass 加密保险库查找、生成、保存并填充登录凭据。

### `identity`

> 用于通过 Chrome 身份验证流程打开用户选择的 LockPass 官方或自建登录页面，并通过扩展专用回调地址完成账号与当前浏览器扩展设备的授权绑定。扩展不会使用该权限读取用户的 Google 账号资料。

### `scripting`

> 仅在用户主动启用“网页填充”并授予网站访问权限后，动态注册或执行 LockPass 内容脚本，用于识别登录输入框、显示 LockPass 图标，并在用户操作后填充选中的登录凭据或生成的密码。

### `storage`

> 用于在本地保存界面语言、主题、服务器设置、授权账号与设备摘要，以及当前扩展会话和用户选择状态，使配置可在扩展重启后恢复。设备令牌和安全密钥不会以明文写入 chrome.storage。

### Optional host permissions

> LockPass 是密码管理器，需要在用户选择的任意登录网站中识别账号和密码输入框并执行填充，因此提供可选的 HTTP/HTTPS 网站访问权限。只有用户主动启用“网页填充”并确认授权后才会注册内容脚本；未授权时不会在网页中运行。
