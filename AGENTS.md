# AGENTS.md
 
## 开发要求
前端需要支持多语言，前期只用中文和英文。

## 术语统一

面向用户的文案必须走多语言，不要在组件里硬编码中文或英文。中文与英文优先使用以下术语：

| 概念 | 中文 | English | 说明 |
| --- | --- | --- | --- |
| master password | 主密码 | master password | 用户记忆并输入的密码。 |
| Secret Key / secretKey | 安全密钥 | Secret Key | 用户离线保存或由受信任设备安全存储的高熵密钥；不能找回主密码，也不能单独解锁保险库；中文界面不要使用 `Emergency Kit`。 |
| vault | 保险库 | vault | 保存条目和附件的加密空间。 |
| item | 条目 | item | 保险库里的登录、银行卡、笔记、附件等。 |
| trusted device | 受信任设备 | trusted device | 已把安全密钥保存到系统安全存储的设备。 |
| system secure storage | 系统安全存储 | OS secure storage | Windows Credential Manager / macOS Keychain / Linux Secret Service。 |

## 测试规则
在自测完后，如果有启动服务，需要关闭，避免服务占用端口。

## 代码规范

需要考虑扩展性，模块化,结构清晰，和易维护性,单个文件不要过大

## 其它 
-  测试代码不要和正式代码混在一起，可以单独一个文件
