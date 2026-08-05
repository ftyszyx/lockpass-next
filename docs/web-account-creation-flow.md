# 网站创建账号流程

## 目标

网站创建账号只负责建立服务器账号、验证邮箱、完成当前浏览器/桌面端设备绑定，并引导用户创建本地可解密的保险库密钥材料。

服务器账号不使用“账号密码注册”。用户在网站上输入邮箱，通过邮箱验证码证明邮箱所有权；主密码只用于本地解锁保险库，不能作为服务器登录密码，也不能上传服务器。

目标体验参考 1Password：

1. 输入姓名和邮箱。
2. 输入邮箱验证码。
3. 设置主密码。
4. 生成 Secret Key。
5. 要求用户备份 Secret Key。
6. 完成账号创建并进入桌面端或 Web 端后续解锁/保存流程。

面向中文用户时，Secret Key 统一显示为“安全密钥 / Secret Key”。不要使用“恢复密码”或“Emergency Kit”。

## 用户流程

### 1. 创建账号

页面只收集服务器账号所需的最小信息：

1. 姓名或显示名称。
2. 电子邮件地址。
3. 可选营销订阅选项。

页面不出现密码输入框。点击下一步后，网站请求服务端发送 6 位邮箱验证码。

用户可见文案应表达为：

```text
创建账号
姓名
电子邮件地址
下一步
```

### 2. 验证邮箱

服务端向邮箱发送一次性 6 位验证码。网站进入验证码页面：

```text
验证您的电子邮件地址
我们向 xxx@example.com 发送了 6 位验证码。
输入代码
下一步
没有收到代码？再次发送。
电子邮件地址错误？返回。
```

验证码规则：

1. 只用于验证邮箱所有权。
2. 不能作为主密码、Secret Key、设备 token 或长期登录凭据。
3. 必须有过期时间，例如 10 分钟。
4. 必须限制重发频率、尝试次数和 IP / 邮箱维度速率。
5. 服务端只保存验证码哈希，不保存明文验证码。

验证码验证成功后，服务端可以创建一个短生命周期的 `accountSetupToken`。该 token 只允许完成当前账号创建流程，不能访问保险库同步 API。

### 3. 设置主密码

邮箱验证成功后，网站展示主密码设置页：

```text
设置账户密码
这是一个需要您记住的密码。
密码
确认密码
为了保护您，我们无法重置已遗忘的密码。
创建账号
```

这里的“账户密码”在产品语义上应逐步统一为“主密码”。它的作用是解锁保险库，不是服务器登录密码。

客户端处理：

1. 浏览器本地校验主密码长度和确认密码一致。
2. 浏览器本地执行 KDF：`unlockKey = Argon2id(主密码 + Secret Key, kdfParams)`。
3. 主密码明文不能上传服务器，不能写入日志、URL、localStorage 或普通 IndexedDB。

服务端处理：

1. 不接收主密码。
2. 不保存主密码哈希。
3. 不允许通过“忘记密码”重置用户保险库解锁能力。

如果未来为了 Web 账号登录仍需要长期登录方式，应继续使用邮箱验证码、OAuth、受信任设备或 passkey，而不是把保险库主密码变成服务器登录密码。

### 4. 生成 Secret Key

主密码通过本地校验后，客户端生成 256-bit 随机 Secret Key，也就是代码中的 `secretKey`。

页面可分成两步：

```text
获取您独一无二的 Secret Key
您的 Secret Key 经由您自己的设备生成。它只属于您，不要与他人共享。
生成 Secret Key
```

点击生成后：

1. 浏览器使用 Web Crypto 生成随机 Secret Key。
2. Secret Key 展示为分组文本，例如 `LP-XXXX-...`。
3. 同时生成二维码，方便桌面端或其他设备扫描。
4. Secret Key 不上传服务器。

### 5. 备份 Secret Key

生成后必须进入备份确认页：

```text
备份您的 Secret Key 以避免无法访问账户
LP-XXXX-.......
保存 PDF

我们没有您的 Secret Key 记录，也无法帮助您恢复。请确保您始终能找到它。
```

备份规则：

1. 用户必须明确确认已经保存 Secret Key，才能完成创建。
2. 可提供“保存 PDF”或打印入口，但 PDF 生成必须在客户端完成。
3. PDF 或二维码中可以包含邮箱、显示名称、服务器地址和 Secret Key；不能包含主密码。
4. 浏览器端生成的 PDF 不应自动上传服务器。
5. 如果当前设备被标记为受信任设备，客户端可以把 Secret Key 保存到系统安全存储；普通浏览器 Web 端不能假设具备系统安全存储。

## 密钥创建原理

首个保险库创建时，客户端本地完成全部密钥动作：

```text
accountId = 服务端账号 id
email = 已验证邮箱
displayName = 用户输入姓名

主密码 = 用户输入，只在本地内存中短暂存在
secretKey = random(32 bytes)  # 用户可见为 Secret Key
kdfParams = 当前客户端 KDF profile
unlockKey = Argon2id(domain("lockpass unlock v1") || encoded(主密码) || encoded(secretKey), kdfParams)

vaultKey = random(32 bytes)
wrappedVaultKey = AEAD_Encrypt(
  key = unlockKey,
  plaintext = vaultKey,
  aad = { purpose: "wrap-vault-key-v1", accountId, vaultId, keyId, kdfVersion, schemaVersion }
)
```

上传到服务器：

1. `accountId`
2. 邮箱、显示名称、邮箱验证状态
3. 设备记录和设备 token hash
4. `wrappedVaultKey`
5. KDF 参数
6. 初始密文对象，例如默认保险库元数据

禁止上传到服务器：

1. 主密码明文
2. 主密码哈希
3. Secret Key 明文
4. `unlockKey`
5. `vaultKey` 明文
6. 条目明文

## 服务端职责

服务端只负责账号、邮箱验证、设备绑定和密文存储：

1. 创建邮箱验证码 challenge。
2. 校验验证码。
3. 创建服务器账号。
4. 创建 Web session 或一次性设备绑定 token。
5. 保存设备信息和 device token hash。
6. 接收客户端上传的 `wrappedVaultKey` 和密文对象。
7. 提供新设备获取密文快照的 API。

服务端不能做：

1. 校验主密码是否正确。
2. 重置主密码后恢复旧保险库。
3. 生成、保存或恢复 Secret Key。
4. 解密 `wrappedVaultKey` 或条目内容。

## API 草案

第一版服务器账号 API 统一使用邮箱验证码：

```http
POST /auth/email/start
POST /auth/email/verify
POST /auth/account/complete
POST /auth/device/bind
GET  /auth/me
POST /auth/logout
```

### 发送验证码

```http
POST /auth/email/start
Content-Type: application/json

{
  "email": "user@example.com",
  "displayName": "Alice",
  "purpose": "register"
}
```

返回：

```json
{
  "challengeId": "email-challenge-id",
  "expiresAt": "2026-06-24T12:00:00Z",
  "resendAfterSeconds": 60
}
```

### 验证验证码

```http
POST /auth/email/verify
Content-Type: application/json

{
  "challengeId": "email-challenge-id",
  "code": "169190"
}
```

返回：

```json
{
  "accountSetupToken": "short-lived-token",
  "email": "user@example.com",
  "displayName": "Alice",
  "expiresAt": "2026-06-24T12:05:00Z"
}
```

### 完成账号创建

```http
POST /auth/account/complete
Authorization: Bearer accountSetupToken
Content-Type: application/json

{
  "deviceName": "Windows desktop",
  "clientDeviceId": "device-local-id",
  "wrappedVaultKey": { "...": "..." },
  "kdfParams": { "...": "..." },
  "initialObjects": []
}
```

返回：

```json
{
  "account": {
    "id": "account-id",
    "displayName": "Alice",
    "email": "user@example.com"
  },
  "device": {
    "id": "device-id",
    "name": "Windows desktop"
  },
  "deviceToken": "device-token",
  "tokenType": "Bearer"
}
```

## 数据模型草案

新增或调整：

| 表 | 用途 |
| --- | --- |
| `email_challenges` | 邮箱验证码 challenge，保存邮箱、用途、验证码哈希、过期时间、尝试次数 |
| `account_setup_tokens` | 邮箱验证成功后的短期创建流程 token，可选也可以复用带用途的 session 表 |
| `accounts` | 不再需要 `password_hash` 作为服务器长期密码哈希；可以保留 nullable 字段做迁移 |
| `account_identities` | 邮箱身份，记录 provider=`email`、provider_subject=邮箱、display_label |
| `devices` | 首次创建完成后绑定设备 |
| `wrapped_vault_keys` | 保存客户端上传的 `wrappedVaultKey` |

验证码存储建议：

```text
code = 6 位随机数字
codeHash = HMAC(serverSecret, challengeId || email || code)
```

数据库只存 `codeHash`。校验时用常量时间比较。验证码发送日志不得记录明文 code；开发环境的实例邮件配置默认使用日志模式，可以把 code 输出到服务端日志，但日志级别和文案必须清楚标记为开发模式。生产环境第一版使用标准 SMTP 发送，并在管理后台配置发件人、SMTP 主机、端口、用户名、密码和邮箱验证码签名密钥。阿里云邮件推送、腾讯云 SES、Resend、AWS SES、SendGrid 和企业邮箱都通过同一组 SMTP 配置接入。

## 安全边界

1. 邮箱验证码只证明邮箱所有权，不证明用户知道主密码。
2. 主密码只存在于客户端内存，用于派生 `unlockKey`。
3. Secret Key 由客户端生成，只展示给用户保存。
4. 用户忘记主密码且没有其他已解锁设备时，服务端无法恢复保险库。
5. 用户丢失 Secret Key 且没有受信任设备时，服务端无法恢复保险库。
6. 攻击者即使控制服务器数据库，也只能拿到邮箱、设备、密文、`wrappedVaultKey` 和 KDF 参数，不能解密条目。
7. 邮箱被攻击时，攻击者可以登录服务器账号并下载密文，但仍需要主密码和 Secret Key 才能解密保险库。因此邮箱验证码不能替代保险库解锁。

## 与桌面端初始化的关系

PC 客户端首次启动时，如果本机没有账号，只展示“登录”和“创建新账号”两个入口。两者分工如下：

1. 登录：用户已有服务器账号和保险库。PC 客户端先让用户输入邮箱和服务器，再输入主密码和安全密钥，然后从服务器拉取 `wrappedVaultKey` 和密文对象，在本地解锁。
2. 创建新账号：PC 客户端打开网站创建账号页面，用户走本文档的账号创建流程。

网站创建完成后，通过 deep link 把账号、设备和 `deviceToken` 交给 PC 客户端。PC 客户端收到回调后，可以从服务器拉取 `wrappedVaultKey` 和初始密文对象，完成本机账号保存和后续解锁流程。

推荐目标态是：网站负责账号创建、邮箱验证、主密码设置、Secret Key 生成和备份确认；PC 客户端登录入口只负责已有账号在新设备上的恢复和解锁。无论在哪个客户端完成密钥创建，都必须坚持“主密码和 Secret Key 不上传服务器”。

## 文案要求

中文：

1. master password：主密码。
2. Secret Key / secretKey：安全密钥 / Secret Key。
3. vault：保险库。
4. trusted device：受信任设备。
5. OS secure storage：系统安全存储。

不要在用户界面中写：

1. 恢复密码。
2. Emergency Kit。
3. 同步 cursor / revision / event。
4. 服务器保存了您的密码。

## 待决策

1. 邮箱验证码是只用于注册，还是登录也完全使用邮箱验证码。
2. Web 端是否立即支持浏览器本地保险库解锁，还是只做账号创建和桌面端设备绑定。
3. 是否支持 passkey 作为后续无密码服务器登录方式。

## 已决策

1. 邮件发送第一版使用可插拔发送层：实例配置中选择开发日志模式或 SMTP 模式，配置入口在管理后台。
2. SMTP 是第一版真实邮件服务接入方式，不直接绑定单一厂商；阿里云邮件推送、腾讯云 SES、Resend、AWS SES、SendGrid 和多数企业邮箱都可通过 SMTP 配置接入。

