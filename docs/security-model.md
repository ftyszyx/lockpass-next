# 安全模型

本文定义 LockPass 的密钥、解锁、存储和同步安全边界。

## 核心原则

1. 主密码和密钥材料的明文只在客户端内存中短暂存在；条目明文只在已解锁会话中出现。
2. 主密码、安全密钥、`unlockKey`、`vaultKey` 和条目明文不上传服务器。
3. 服务器和普通本地存储只保存密文、版本信息和白名单内的同步元数据。
4. `unlockKey` 必须由主密码和安全密钥通过带版本参数的 Argon2id 派生。
5. `wrappedVaultKey`、条目、附件索引和备份包统一使用 AES-256-GCM 加密并认证。
6. 密文格式、KDF 参数、本地 schema、服务器 schema 和同步协议都必须带版本。
7. Windows 受信任设备只在系统安全存储中保存安全密钥。每次解锁仍要求输入主密码并完整执行 Argon2id。
8. 默认解锁不依赖 Windows Hello、Windows PIN、指纹或人脸，也不保留免主密码解锁材料。
9. 备份包必须加密并认证，不能包含安全密钥或其他解密密钥的明文。

## 密钥模型

| 密钥 | 来源与用途 | 保存规则 |
| --- | --- | --- |
| 主密码 | 用户记忆并在解锁时输入；参与派生 `unlockKey` | 不保存、不上传 |
| 安全密钥（Secret Key，代码字段 `secretKey`） | 客户端生成的高熵随机密钥；与主密码共同派生 `unlockKey` | 用户离线备份；受信任设备保存到系统安全存储；不上传 |
| `unlockKey` | 主密码、安全密钥和 KDF 参数通过 Argon2id 派生 | 只在一次解锁过程中短暂存在 |
| `vaultKey` | 创建保险库时由系统安全随机源生成的 32 字节随机密钥 | 只在已解锁会话内存在；持久化时必须被包裹 |
| `wrappedVaultKey` | 使用 `unlockKey` 加密后的 `vaultKey` | 可以保存到本地密文库和服务器 |

安全密钥不能找回、重置或绕过主密码。

```mermaid
flowchart LR
  password["主密码<br/>用户每次输入"] --> kdf["Argon2id"]
  secret["安全密钥<br/>离线备份"] --> kdf
  params["KDF 参数<br/>可持久化"] --> kdf
  secret -. "受信任设备" .-> secureStore["系统安全存储"]
  kdf --> unlockKey["unlockKey<br/>临时"]
  unlockKey --> wrapped["解开 wrappedVaultKey"]
  wrapped --> vaultKey["vaultKey<br/>仅解锁会话"]
  vaultKey --> encrypted["加密 / 解密<br/>条目与附件"]
  wrapped -. "密文" .-> storage["本地密文库 / 服务器"]
  encrypted -. "仅上传密文" .-> storage
```

## 受信任设备解锁

这里的“快速”不是免密码，而是用户每天只输入主密码。安全密钥由受信任设备的系统安全存储自动提供，两者仍在本机组合后完整执行 Argon2id。

旧方案中的 `deviceUnlockKey`、`deviceWrappedVaultKey` 和 Windows Hello/PIN 解锁不再属于默认协议。现有代码或历史数据如果仍包含这些字段，只能作为待清理的兼容内容，不能为新账号继续生成。

```mermaid
flowchart TD
  account["选择本机账号"] --> hasSecret{"系统安全存储中<br/>有安全密钥？"}
  hasSecret -- "有" --> masterOnly["输入主密码"]
  masterOnly --> loadSecret["自动读取安全密钥"]
  loadSecret --> dailyDerive["Argon2id 派生 unlockKey"]
  dailyDerive --> dailyUnwrap["验证并解开 wrappedVaultKey"]
  dailyUnwrap -- "成功" --> unlocked["进入保险库"]
  dailyUnwrap -- "失败" --> locked["保持锁定"]
  hasSecret -- "没有或读取失败" --> fullUnlock["输入主密码和安全密钥"]
  fullUnlock --> fullDerive["Argon2id 派生 unlockKey"]
  fullDerive --> fullUnwrap["验证并解开 wrappedVaultKey"]
  fullUnwrap -- "失败" --> locked
  fullUnwrap -- "成功" --> saveSecret["自动保存安全密钥"]
  saveSecret --> unlocked["进入保险库"]
```

### 首次启用或新设备恢复

1. 用户输入主密码和安全密钥。
2. 客户端使用 Argon2id 派生 `unlockKey`。
3. 客户端使用 AES-256-GCM 验证并解开 `wrappedVaultKey`，得到 `vaultKey`。
4. 只有解锁成功后，客户端才把安全密钥自动保存到系统安全存储，并把当前设备标记为受信任设备。
5. 桌面端不再询问用户是否保存安全密钥；主密码和 `unlockKey` 始终不保存。


### 日常解锁

1. 用户选择本机账号并输入主密码。
2. Rust 从系统安全存储读取该账号的安全密钥。
3. 客户端完整执行 Argon2id，派生 `unlockKey` 并解开 `wrappedVaultKey`。
4. `vaultKey` 只在保险库已解锁期间存在，用来解密条目和附件。

## 加密规则

### 密钥派生与加密

```text
passwordBytes = utf8(nfkc(主密码))
secretKeyBytes = base64url_decode(安全密钥)
unlockInput = domain("lockpass unlock v1")
              || len(passwordBytes) || passwordBytes
              || len(secretKeyBytes) || secretKeyBytes
unlockKey = Argon2id(input = unlockInput, params = kdfParams, outputLen = 32)

vaultKey = randomKey(32)
wrappedVaultKey = AES_256_GCM_Encrypt(
  key = unlockKey,
  plaintext = vaultKey,
  aad = { purpose, accountId 或 vaultId, keyId, kdfVersion, schemaVersion }
)

encryptedItem = AES_256_GCM_Encrypt(
  key = vaultKey,
  plaintext = canonicalJson(item),
  aad = { objectType, objectId, vaultId, schemaVersion, revision, keyId }
)
```

用户修改主密码时，只需使用新 `unlockKey` 重新包裹 `vaultKey`，不需要重加密全部条目。

### KDF 与 AES-256-GCM 约束

1. 主密码进入 KDF 前使用 NFKC normalization 和 UTF-8 编码。
2. 安全密钥必须由密码学安全随机源生成，展示和输入使用 base64url 或分组文本。
3. 主密码和安全密钥不能做普通字符串拼接；KDF 输入必须包含域隔离标签和长度前缀。
4. Argon2id 参数必须随 `wrappedVaultKey` 保存，并由客户端校验允许的 profile。
5. AES-256-GCM 的 AAD 必须绑定对象用途、对象 ID、保险库或账号范围、格式版本、密钥 ID 和相关 revision。
6. 解密时必须使用与加密时完全相同的 AAD，防止密文被调包到其他条目、保险库或账号。
7. 同一 `keyId` 下不能复用 nonce。随机 nonce 必须使用密码学随机源生成的 96-bit 值。
8. 禁止使用 `Math.random`、时间戳、对象 ID 或 revision 单独生成 nonce。

## 存储边界

| 位置 | 允许保存 | 禁止保存 |
| --- | --- | --- |
| 系统安全存储 | 当前账号的安全密钥 | 主密码、`unlockKey`、`vaultKey`、条目明文 |
| 普通 app data / SQLite | KDF 参数、`wrappedVaultKey`、密文对象、同步状态和非敏感元数据 | 安全密钥明文、主密码、会话密钥、条目明文 |
| 服务器 / PostgreSQL | `wrappedVaultKey`、密文对象、版本和白名单内的同步元数据 | 主密码、安全密钥、`unlockKey`、`vaultKey`、条目明文 |
| 解锁会话内存 | `vaultKey`、临时 `unlockKey`、当前使用的条目明文 | 任何跨锁定或跨进程重启的持久化 |
| 加密备份包 | 密文 envelope、加密 manifest、必要版本信息 | 安全密钥和其他解密密钥的明文 |

系统安全存储主要防普通本地数据库、服务器和备份文件泄露。它不能防已经控制当前 OS 用户会话的恶意软件、键盘记录器、进程注入或已解锁会话窃取。

## 安全密钥生命周期

1. 第一台设备创建保险库时生成安全密钥，并要求用户完成离线备份。
2. 完整解锁成功后，桌面端自动把安全密钥保存到当前设备的系统安全存储。
3. 已解锁的旧设备可以在用户再次输入并验证主密码后显示安全密钥或迁移二维码。
4. 二维码内容等价于安全密钥，必须短时显示，并按相同敏感级别处理。
5. 新设备使用主密码和安全密钥完成解锁后，自动保存安全密钥并成为受信任设备。
6. 安全密钥不能单独解锁保险库，也不能找回或重置主密码。
7. 如果用户丢失所有受信任设备和离线保存的安全密钥，服务器无法恢复保险库内容。
8. 浏览器 Web 不能假设具备等价的系统安全存储能力；建立受信任设备前必须单独定义并验收平台保护方案。

当前桌面端可展示和保存安全密钥；二维码迁移、服务端 `wrappedVaultKey` 分发和新设备恢复闭环必须单独验收后，才能标记为已完成能力。

## 账号与多设备流程

服务器账号用于身份验证、设备管理和密文分发，不是保险库解密凭据。网站账号创建优先使用邮箱验证码，不把主密码作为服务器长期登录密码。

| 场景 | 用户操作 | 客户端处理 |
| --- | --- | --- |
| 新用户首次初始化 | 网站完成邮箱验证；桌面端设置主密码并备份安全密钥 | 生成 `vaultKey` 和安全密钥，创建 `wrappedVaultKey`，自动保存安全密钥，上传密文 |
| 老用户使用新电脑 | 登录服务器账号；输入主密码和安全密钥 | 下载密钥包和密文，本机解锁成功后自动保存安全密钥 |
| 老用户使用旧电脑 | 选择本机账号；只输入主密码 | 从系统安全存储读取安全密钥并完成解锁 |

用户可见流程只展示“未登录服务器”“等待保存到服务器”“已保存到服务器”“有冲突”等状态，不要求用户理解同步队列、cursor、revision 或事件流。

联网时，条目修改应立即加密并保存到服务器。断网时先保存到本机密文库并标记为待保存；恢复联网、窗口回到前台或用户主动检查状态时，先上传本机修改，再拉取服务器变化。

## 客户端信任边界

1. 共享的 `@lockpass/crypto` provider 负责 Argon2id、AES-256-GCM、密文 envelope 和会话状态。
2. 页面组件只传递随机 `sessionId`，不直接持有 `vaultKey`。`sessionId` 是代码模块边界，不是操作系统级隔离。
3. Rust 负责系统安全存储、本地数据库和文件访问。Windows 解锁只读取 Credential Manager 中的安全密钥，不请求 Windows Hello/PIN。
4. store 只保存账号 ID、`sessionId`、`keyId` 等引用状态；锁定后这些引用也必须清理。
5. 桌面 WebView 与 provider 属于同一客户端信任域。生产版只加载随安装包发布的本地资源，不加载远程 script，也不使用 `v-html`、`eval` 等动态代码执行能力；Tauri command 不作为独立于前端代码的安全隔离层。发布包和更新包仍必须签名并验证。
6. 如果以后要求密钥与扩展 JavaScript 做进程级隔离，应增加 Native Messaging provider，而不是复制一套密文协议。

## 同步元数据边界

服务端明文元数据采用白名单。未明确列出的字段默认进入密文 envelope。

| 类别 | 服务端可明文保存 | 必须加密 |
| --- | --- | --- |
| 账号和设备 | account ID、登录凭据哈希、device ID、设备名称、设备状态、token hash、最后同步时间 | 主密码、安全密钥、`unlockKey`、`vaultKey` |
| 同步定位 | sync space ID、vault ID、object ID、object type、key ID、revision、base revision、event cursor、deletedAt、updatedAt | 保险库名称和描述、条目标题、subtitle、URL、tags、notes、字段值 |
| 附件 | attachment object ID、所属 item ID、密文大小、同步状态 | 文件名、MIME type、原始大小、明文 checksum、预览图、附件索引 |
| 搜索和统计 | 配额用量、密文对象数量、密文总大小 | 明文搜索索引、域名索引、弱密码检测结果、密码健康详情 |

如果体验要求新增服务端明文字段，必须先更新白名单，并说明泄露范围和用户可关闭方式。

## 设备撤销与回滚检测

服务端撤销设备 token 只能阻止该设备继续调用 API、拉取新密文或上传修改，不能远程清除该设备已经下载的数据或已解锁会话。

本机移除账号时，客户端必须删除该账号在系统安全存储中的安全密钥、设备 token、本机密文和会话状态。`vaultKey` 轮换和全量重加密属于后续增强能力；轮换后所有设备必须使用新的 `wrappedVaultKey` 完成下一次解锁。

客户端只能相对本地可信 checkpoint 检测回滚：

1. event cursor 不能小于本地已确认高水位。
2. 同一对象的 revision 不能低于本地已见最大 revision。
3. envelope AAD 中的对象 ID、保险库 ID、格式版本和 revision 必须与外层同步元数据一致。
4. 新设备首次同步没有本地 checkpoint，只能建立首次基线，或由另一台可信设备、离线备份交叉校验。

## 威胁模型

| 威胁 | 处理方式与剩余风险 |
| --- | --- |
| 本地 SQLite 泄露 | 本地数据库只保存密文和非敏感元数据 |
| 服务器或 PostgreSQL 泄露 | 服务端没有解密密钥，不能直接解密条目 |
| 服务器恶意返回旧数据 | 已使用过的设备依据本地 checkpoint 检测；新设备首次同步只能建立基线 |
| 备份文件被替换 | 备份 envelope 和 manifest 必须做完整性认证 |
| 安装包或更新包被篡改 | 发布包和更新包必须签名并验证；用户运行被篡改的客户端后，该客户端处于本机信任域内，能够接触已解锁数据 |
| 锁定后旁人操作 | 锁定销毁 provider 会话和界面明文；再次进入必须输入主密码并运行 Argon2id |
| 系统安全存储中的安全密钥泄露 | 安全密钥不能单独解锁，但攻击者仍可能结合主密码窃取或已解锁会话完成攻击 |
| 终端恶意软件 | Credential Manager 不等于每次读取都验证用户存在；不能抵抗键盘记录、进程注入和同用户凭据 API 滥用 |
| 日志泄露 | 禁止记录主密码、token、安全密钥、解密结果和条目明文 |

## 数据格式草案

### 密文 envelope

```json
{
  "version": 1,
  "alg": "AES-256-GCM",
  "keyId": "vault-key-id",
  "nonce": "base64url",
  "aad": {
    "objectType": "vault_item",
    "objectId": "uuid",
    "vaultId": "uuid",
    "schemaVersion": 1,
    "revision": 4,
    "purpose": "encrypt-vault-object-v1"
  },
  "ciphertext": "base64url",
  "tag": "base64url"
}
```

`wrappedVaultKey` 的 `aad.purpose` 必须是 `wrap-vault-key-v1`，并包含 `keyId`、`kdfVersion` 和 `schemaVersion`。账号级 `vaultKey` 必须绑定 `accountId`；单保险库密钥必须绑定 `vaultId`。

### KDF 参数

```json
{
  "version": 1,
  "name": "argon2id",
  "memoryKiB": 32768,
  "iterations": 2,
  "parallelism": 1,
  "salt": "base64url",
  "keyLengthBytes": 32,
  "inputEncoding": "domain-tagged-length-prefixed-utf8",
  "passwordNormalization": "NFKC",
  "purpose": "lockpass unlock v1"
}
```

当前开发阶段只接受该 profile。调整参数时开发库需要删除并重新创建账号；正式发布前必须设计参数迁移策略。

## 数据库迁移

1. 每次 schema 变更提升 `schemaVersion`。
2. migration 必须逐步执行，例如 `1 -> 2 -> 3`，不能只实现 `1 -> 3`。
3. SQLite 和 PostgreSQL migration 必须在事务中执行，失败时完整回滚。
4. 迁移测试必须覆盖旧库 fixture、旧密文格式和服务器 schema。
