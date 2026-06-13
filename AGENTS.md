# AGENTS.md
 
## 开发要求
前端需要支持多语言，前期只用中文和英文。

## 术语统一

面向用户的文案必须走多语言，不要在组件里硬编码中文或英文。中文与英文优先使用以下术语：

| 概念 | 中文 | English | 说明 |
| --- | --- | --- | --- |
| master password | 主密码 | master password | 用户记忆并输入的密码。 |
| recovery key / recoveryKey | 恢复密钥 | recovery key | 用户离线保存或由受信任设备安全存储的高熵密钥；中文界面不要使用 `Emergency Kit`。 |
| vault | 保险库 | vault | 保存条目和附件的加密空间。 |
| item | 条目 | item | 保险库里的登录、银行卡、笔记、附件等。 |
| trusted device | 受信任设备 | trusted device | 已把恢复密钥保存到系统安全存储的设备。 |
| system secure storage | 系统安全存储 | OS secure storage | Windows Credential Manager / macOS Keychain / Linux Secret Service。 |

代码变量、接口字段和安全模型中可以保留 `recoveryKey`、`vaultKey`、`wrappedVaultKey` 等技术名；用户可见文案应翻译为“恢复密钥 / recovery key”。

新增或调整术语时，需要同步检查桌面端、服务端 Web、文档和原型页面：`apps/*/src`、`docs/*.md`、`docs/*prototype*.html`、`README.md`。中文界面文案统一放在中文语言包或原型中文文案中，英文界面文案统一放在英文语言包中；技术变量名不算用户文案。

## 测试规则
在自测完后，如果有启动服务，需要关闭，避免服务占用端口。

桌面端可通过网页前端验收：运行 `npm run dev:frontend --workspace @lockpass/desktop` 或由 `tauri dev` 自动启动的 BeforeDevCommand，然后访问 Vite 输出的本地地址进行 UI 流程检查。验收完成后同样需要关闭启动的服务。
