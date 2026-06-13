# 服务器端同步方案

## 目标

服务器端用于账户登录、设备绑定、密文同步和后续托管服务扩展。它必须开源，用户可以自部署；官方托管只是在同一协议上的托管实例。

服务端不保存用户主密码、vault key 或条目明文。桌面端的本地用户和主密码只负责本机解锁；服务器账号只负责同步身份、设备和配额。

## 技术栈

| 模块 | 建议 |
| --- | --- |
| HTTP 服务 | Rust + Axum |
| 异步运行时 | Tokio |
| 数据库 | PostgreSQL |
| 数据访问 | SQLx，编译期 SQL 校验 |
| 迁移 | SQLx migrations |
| 会话和限流 | Redis 可选；单机自部署可先用 PostgreSQL |
| Web 页面 | Vue + TypeScript + Tailwind |
| 部署 | Docker Compose，包含 server + postgres |

第一版后端 API 优先保持单体服务，后续再拆分认证、同步、计费等服务。Web 页面独立为前端应用，调用 Rust API。

## 服务边界

| 子模块 | 职责 |
| --- | --- |
| Auth | 注册、登录、第三方身份绑定、会话、回调 |
| Device | 设备绑定、设备 token、撤销设备 |
| Sync | 上传密文对象、拉取增量、revision、tombstone |
| Account Web | 注册页、登录页、OAuth 回调页（预留）和用户后台 |
| User Console | 用户后台、设备、身份、安全、用量和 token 管理 |
| Admin Console | 管理员后台、用户、实例配置、配额、审计和权限 |
| Permission | 角色、权限、后台访问控制、管理员操作审计 |
| Billing Extension | 官方托管的套餐、设备数、存储配额 |

自部署版本默认不强制计费，但保留配额字段，方便官方托管复用同一套代码。

## 代码模块边界

服务端实现拆成 API 服务和可复用认证 crate：

```text
server/
  src/api/auth.rs        HTTP 路由，只处理请求和响应
  src/storage/           账号、身份、会话、设备和同步数据 repository
  crates/auth/           独立认证 crate
  migrations/0001_auth_account.sql
                         登录、账号管理、设备绑定、token、RBAC，可独立迁移
  migrations/0002_sync.sql
                         密文同步对象、同步事件和实例配置
```

`server/crates/auth` 负责邮箱标准化、密码策略、Argon2 hash、密码校验、token 生成和 token hash。当前主要打通邮箱密码/开发登录链路；短信、Google、微信只保留 provider 类型和实例配置入口，默认禁用，后续作为新的 `AuthProvider` 实现加入，不放进 repository 或 HTTP handler。

## 账户模型

服务器账号是同步账号，不等于桌面端本地用户。一个服务器账号可以绑定多个登录身份，也可以绑定多个设备。

```text
account
  ├─ identity: phone / google / wechat / email
  ├─ device: Windows / macOS / Linux / future mobile
  └─ sync space: desktop local account label + encrypted vault metadata + encrypted objects
```

建议表结构：

| 表 | 说明 |
| --- | --- |
| `accounts` | 服务器账号主体 |
| `account_identities` | 邮箱等登录身份；手机、Google、微信是后续预留 provider |
| `auth_sessions` | Web 登录态 |
| `oauth_states` | 第三方登录 state / PKCE / 回调校验，当前为 OAuth 预留 |
| `sms_codes` | 短信验证码哈希、过期时间、尝试次数，当前为 SMS 预留 |
| `devices` | 已绑定设备、token 哈希、状态 |
| `sync_spaces` | 账号下的同步空间，用明文 `display_name` 区分桌面端本地账号 |
| `wrapped_vault_keys` | 使用用户本地 `unlockKey` 包裹后的 `wrappedVaultKey` |
| `sync_objects` | 密文对象、revision、删除标记 |
| `sync_events` | 增量事件流 |
| `roles` / `permissions` | 后台权限模型 |
| `account_roles` | 账号角色绑定 |
| `admin_audit_logs` | 管理员操作审计 |
| `subscriptions` | 官方托管扩展点 |

敏感 token、验证码和 refresh token 只保存哈希或加密后的值。

## 登录与注册

第一版服务端需要支持统一账户体系，登录方式可以逐步接入：

| 登录方式 | 用途 | 第一版建议 |
| --- | --- | --- |
| 邮箱密码 | 自部署兜底方式 | 当前优先支持，方便私有部署和开发验收 |
| 手机短信 | 国内用户快速注册登录 | 仅预留接口和配置入口，默认禁用，短信供应商后接 |
| Google | 国际用户登录 | 仅预留 OAuth/OIDC 入口，默认禁用 |
| 微信 | 国内社交登录 | 仅预留微信开放平台 OAuth 入口，默认禁用 |

注册不需要单独复杂流程：任何登录方式首次成功时，如果找不到账号，就创建账号并绑定该登录身份。

### 官方托管登录与设备绑定

桌面端不直接输入服务器账号密码，也不要求用户复制 Web session token。流程：

1. 用户在网页登录页选择当前启用的登录方式；现阶段以邮箱密码/开发登录为主，手机短信、Google 和微信入口即使出现在原型或配置中也按预留/禁用处理。
2. 任意登录方式认证成功后，服务端创建普通 Web session token。
3. 桌面端打开网页登录页时带上设备绑定参数（设备名称、服务器模式和 API 地址）。
4. Web 登录成功后，Web 端使用当前 Web session token 调用 `POST /auth/device/bind`，提交设备名称和可选设备公钥。
5. 服务端创建 `devices` 记录，返回长期 `deviceToken`；这个 token 默认没有固定过期时间，只能通过撤销设备失效。
6. Web 端通过 `lockpass://auth/callback?...` 回调桌面端，把设备绑定结果交给桌面端保存。
7. 后续 `/sync/*` 只使用 `deviceToken`，不使用普通 Web session token。

这里的关键点是：绑定设备不属于某一种登录方式。邮箱密码以及后续接入的短信、Google、微信等登录方式只负责证明“这是哪个服务器账号”；只要账号认证成功，就可以走同一个设备绑定接口。

这个流程避免在桌面端保存服务器账号密码，也方便后续增加更多登录方式。

### 自建服务器登录

自部署实例也走同一套账号登录和设备绑定逻辑，差异只在服务器地址。

1. 用户在桌面端选择“自建服务器”，填写自建服务器 API 地址。
2. 桌面端打开该实例对应的 Web 登录页，并带上设备绑定参数。
3. 用户在自建 Web 登录页完成登录。
4. Web 端调用同一个 `POST /auth/device/bind` 绑定设备，并通过 `lockpass://auth/callback?...` 回调桌面端。
5. 桌面端保存长期 `deviceToken`，后续同步只使用 `deviceToken`。

## 密钥同步与新设备解密能力

本节是协议设计和数据库预留，不表示当前产品已经完成新设备恢复闭环。当前实现可以保存/展示 `wrappedVaultKey` 相关数据结构，但桌面端到服务端的完整新设备恢复、密钥轮换和端到端验收仍待完成；用户文案不能把它描述成已可用能力。

设备 token 只证明“这个设备可以访问同步 API”，不能用于解密保险库。新设备要真正恢复密码库，还必须拿到能解开密文对象的 `vaultKey`。服务端不能保存 `vaultKey` 明文，只能保存被用户本地 `unlockKey` 包裹后的密钥材料。

预留的解密能力恢复路径：

1. 服务端保存 `wrappedVaultKey`，也就是使用用户本地 `unlockKey` 加密后的 `vaultKey`。
2. 新设备登录后，用户输入主密码和恢复密钥（`recoveryKey`），本地派生 `unlockKey`，再解开 `wrappedVaultKey` 得到 `vaultKey`。

```text
unlockKey = Argon2id(domain("lockpass unlock v1") || encoded(主密码) || encoded(recoveryKey), kdfParams)
vaultKey = AEAD_Decrypt(key = unlockKey, ciphertext = wrappedVaultKey, aad = vaultKeyAAD)
```

服务端可以保存：

1. `wrappedVaultKey` 和对应的 `keyId`、`vaultId`、KDF 参数。
2. 设备 id、设备名称、授权状态和撤销状态。
3. 密文 vault 对象、revision 和同步事件。

服务端不能保存：

1. 用户主密码。
2. `recoveryKey` 明文。
3. `unlockKey`。
4. `vaultKey` 明文。
5. vault 条目明文。

因此，目标态的新设备同步流程必须分成两步：先通过设备 token 获得同步 API 权限，再通过主密码 + 恢复密钥（`recoveryKey`）解开 `wrappedVaultKey`，获得本地解密能力。当前阶段仅按该目标态预留协议和表结构。

## Web 页面

需要一个 Vue + TypeScript Web 应用，既处理登录回调，也提供用户后台和管理员后台。它不做密码管理器 Web 版，只管理服务器账号、设备、权限和同步配置。

| 页面 | 路径 | 功能 |
| --- | --- | --- |
| 登录页 | `/login` | 展示当前启用的登录入口；手机、Google、微信为预留入口，默认禁用 |
| 注册/首次登录 | `/signup` | 可和登录页合并 |
| OAuth 回调 | `/auth/callback/:provider` | OAuth 预留路由，第三方登录接入前不作为已支持能力 |
| 用户后台 | `/console` | 当前账号、设备、登录身份、用量 |
| 管理员后台 | `/admin` | 用户、配置、配额、审计和权限 |

建议目录：

```text
apps/
  server/       Rust API 服务
  server_web/   Vue + TypeScript 后台与登录页
```

`apps/server_web` 可以复用桌面端已有的 Tailwind 配置、基础 UI 风格和 i18n 方案，但路由、状态和 API client 独立维护。

## 用户后台

用户后台面向普通同步账号，第一版建议包含：

| 模块 | 功能 |
| --- | --- |
| 账号资料 | 昵称、邮箱/手机、已绑定第三方身份 |
| 登录安全 | 绑定/解绑邮箱密码；Google、微信、手机为预留入口，接入前应禁用或标注未启用 |
| 设备管理 | 查看设备、重命名、撤销设备 token |
| 同步状态 | 最近同步时间、对象数量、存储用量 |
| 订阅用量 | 官方托管的套餐、设备数、存储配额 |
| 数据操作 | 注销账号、删除服务端密文数据 |

用户后台不能查看、搜索或导出 vault 明文。即使用户登录 Web 后台，也只能管理同步账号和密文同步状态。

用户后台前端建议使用 Vue Router 分页，Pinia 保存登录态、当前账号、权限和全局配置。

## 管理员后台

管理员后台面向官方托管运维和自部署实例管理员。第一版建议包含：

| 模块 | 功能 |
| --- | --- |
| 用户管理 | 查询账号、禁用/恢复账号、查看登录身份 |
| 设备管理 | 查看和撤销异常设备 |
| 配额管理 | 修改设备数、存储上限、同步频率限制 |
| 实例配置 | 登录方式开关、OAuth 配置、短信供应商配置；SMS/OAuth 在接入 provider 前为预留/禁用入口 |
| 审计日志 | 管理员操作记录、登录失败、敏感配置变更 |
| 权限管理 | 角色、权限、管理员账号授权 |
| 系统状态 | 数据库、任务队列、邮件和短信（预留）发送状态 |

管理员后台同样不能查看 vault 明文，也不能获取用户设备 token 原文。

管理员后台和用户后台可以放在同一个 `apps/server_web` 中，通过路由和权限守卫区分 `/console/*` 与 `/admin/*`。

## 权限模型

后台权限使用 RBAC，必要时再加资源范围限制。当前实现和服务器后台文案只对齐 `user` / `admin` 两类内置角色；更细的 `owner`、`operator`、`support` 角色属于后续规划，原型中不应表现为当前已启用。

| 角色 | 当前状态 | 说明 |
| --- | --- | --- |
| `user` | 已实现 | 普通用户，只能管理自己的账号、设备和 token |
| `admin` | 已实现 | 管理员，可管理用户、角色、实例配置、审计日志和同步数据 |
| `owner` | 后续规划 | 实例所有者，可管理管理员和危险操作 |
| `operator` | 后续规划 | 运维，可处理设备、配额、异常账号 |
| `support` | 后续规划 | 客服/支持，只能查看必要账号状态，不能改配置 |

建议权限点：

| 权限 | 能力 |
| --- | --- |
| `account:read` | 查看账号状态 |
| `account:disable` | 禁用或恢复账号 |
| `device:read` | 查看设备 |
| `device:revoke` | 撤销设备 |
| `quota:write` | 修改配额 |
| `config:read` | 查看实例配置 |
| `config:write` | 修改登录方式和预留 OAuth/SMS 配置 |
| `role:read` | 查看角色和权限 |
| `role:write` | 分配角色 |
| `audit:read` | 查看审计日志 |

权限校验要求：

1. 所有 `/admin/*` 请求必须有管理员角色。
2. 所有管理员写操作必须写入 `admin_audit_logs`。
3. 当前阶段至少保留一个 `admin` 账号，避免锁死后台。
4. 自部署首次启动时创建或指定初始 `admin`。
5. 后续如果引入 `owner` / `operator` / `support`，必须补充授权、降级和审计规则。
6. 官方托管和自部署使用同一套权限模型。

## API 草案

### Auth

```http
POST /auth/email/register
POST /auth/email/login
POST /auth/device/bind
POST /auth/logout
GET  /auth/me
```

### Login identity

```http
POST /auth/sms/send
POST /auth/sms/verify
GET  /auth/oauth/:provider/start
GET  /auth/callback/:provider
POST /auth/email/login
POST /auth/email/register
```

### Device

```http
GET    /devices
PATCH  /devices/:id
DELETE /devices/:id
```

### Sync

```http
GET  /sync/spaces
POST /sync/spaces
GET  /sync/wrapped-vault-keys?syncSpaceId=...
POST /sync/wrapped-vault-keys
GET  /sync/snapshot?syncSpaceId=...
POST /sync/push
GET  /sync/pull?cursor=...
POST /sync/ack
```

同步 API 只接收和返回密文对象，不接收明文字段。

同步 API 只接受带 `sync:read` / `sync:write` scope 的设备 token，不接受 Web session token。用户后台可以展示同步状态和用量，但不能直接拉取密文对象。

`POST /sync/wrapped-vault-keys` 请求：

```json
{
  "syncSpaceId": "uuid",
  "vaultId": "uuid",
  "keyId": "vault-key-id",
  "wrapType": "user_wrapped",
  "replacesWrappedVaultKeyId": "uuid-or-null",
  "kdfParams": {
    "version": 1,
    "name": "argon2id",
    "memoryKiB": 65536,
    "iterations": 3,
    "parallelism": 1,
    "salt": "base64url",
    "keyLengthBytes": 32,
    "purpose": "lockpass unlock v1"
  },
  "wrappedVaultKey": {
    "version": 1,
    "alg": "AES-256-GCM",
    "keyId": "unlock-key",
    "nonce": "base64url",
    "aad": {
      "purpose": "wrap-vault-key-v1",
      "vaultId": "uuid",
      "keyId": "vault-key-id",
      "kdfVersion": 1,
      "schemaVersion": 1
    },
    "ciphertext": "base64url",
    "tag": "base64url"
  }
}
```

`POST /sync/wrapped-vault-keys` 响应：

```json
{
  "wrappedVaultKeyRecord": {
    "id": "uuid",
    "syncSpaceId": "uuid",
    "vaultId": "uuid",
    "keyId": "vault-key-id",
    "wrapType": "user_wrapped",
    "generation": 4,
    "createdAt": "2026-05-20T00:00:00Z"
  }
}
```

`GET /sync/wrapped-vault-keys?syncSpaceId=...` 响应：

```json
{
  "wrappedVaultKeys": [
    {
      "id": "uuid",
      "syncSpaceId": "uuid",
      "vaultId": "uuid",
      "keyId": "vault-key-id",
      "wrapType": "user_wrapped",
      "generation": 3,
      "kdfParams": {},
      "wrappedVaultKey": {}
    }
  ]
}
```

`wrappedVaultKey` 同步语义（协议预留，当前新设备恢复闭环待完成）：

1. `user_wrapped` 表示该 `wrappedVaultKey` 是用用户本地 `unlockKey` 包裹 `vaultKey` 得到的，用于目标态中用户输入主密码和恢复密钥（`recoveryKey`）后恢复。
2. 第一版只支持 `user_wrapped` 这种包装方式。
3. 服务端保存和同步 `wrappedVaultKey`，但不能解开其中的 `vaultKey`。
4. 同一个 `accountId + syncSpaceId + vaultId + keyId` 同一时间只能有一个 active `wrappedVaultKey`。
5. 修改主密码、重新生成恢复密钥（`recoveryKey`）或提升 KDF 参数时，客户端只需要用当前内存中的 `vaultKey` 重新生成 `wrappedVaultKey`，不需要重加密所有条目。
6. 新 `wrappedVaultKey` 写入成功后，服务端必须把被替换的旧 `wrappedVaultKey` 标记为 `revokedAt`，或保证只返回最新 active `wrappedVaultKey`。
7. 其他设备如果无法用本地凭据解开最新 `wrappedVaultKey`，必须上锁并提示用户输入最新主密码和恢复密钥（`recoveryKey`）。

主密码或恢复密钥（`recoveryKey`）变更流程：

```text
当前设备必须先解锁，内存中已有 vaultKey
newUnlockKey = KDF(新主密码 + 新 recoveryKey)
newWrappedVaultKey = AEAD_Encrypt(key = newUnlockKey, plaintext = vaultKey)
POST /sync/wrapped-vault-keys(replacesWrappedVaultKeyId = oldWrappedVaultKeyId, wrappedVaultKey = newWrappedVaultKey)
```

服务端在同一个事务里写入新 `wrappedVaultKey`、递增 `generation`，并撤销旧 `wrappedVaultKey`。其他设备下次同步或解锁时，如果本地凭据无法解开最新 `wrappedVaultKey`，只提示密钥已更新并上锁，不尝试兼容旧 `wrappedVaultKey`。

`POST /sync/push` 请求：

```json
{
  "clientBatchId": "uuid",
  "objects": [
    {
      "clientOperationId": "uuid",
      "syncSpaceId": "uuid",
      "objectId": "uuid",
      "vaultId": "uuid",
      "objectType": "vault_item",
      "baseRevision": 3,
      "revision": 4,
      "encryptedPayload": {
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
      },
      "deletedAt": null
    }
  ]
}
```

`POST /sync/push` 响应：

```json
{
  "accepted": [
    {
      "clientOperationId": "uuid",
      "objectId": "uuid",
      "revision": 4,
      "eventId": 102
    }
  ],
  "conflicts": [
    {
      "clientOperationId": "uuid",
      "objectId": "uuid",
      "expectedRevision": 3,
      "currentRevision": 5,
      "serverObject": {}
    }
  ],
  "rejected": [
    {
      "clientOperationId": "uuid",
      "objectId": "uuid",
      "code": "payload_too_large",
      "message": "encrypted payload exceeds object limit"
    }
  ],
  "nextCursor": 102
}
```

push 语义：

1. `clientBatchId + clientOperationId + deviceId` 作为幂等键，重复提交必须返回同一结果。
2. 请求里的 `revision` 是客户端预期写入的对象 revision，必须等于 `baseRevision + 1`；新对象使用 `baseRevision = 0`、`revision = 1`。服务端只在冲突检查通过后确认并落库该 revision，不能改写已经进入 AEAD AAD 的 revision。
3. 批量请求按对象独立提交，每个对象在数据库事务内完成 revision 检查、对象更新和事件写入。
4. 同一批允许部分成功。成功对象进入 `accepted`，revision 不匹配进入 `conflicts`，格式或配额问题进入 `rejected`。
5. 服务端只校验 envelope 结构、算法版本、字段长度、对象类型、配额、revision，以及 `aad.objectId` / `aad.vaultId` / `aad.revision` / `aad.purpose` 和外层同步元数据的一致性，不解密 `encryptedPayload`。
6. 删除对象也走 push，`deletedAt != null` 时写入 tombstone，并追加 `deleted` 事件。
7. 同一批请求中不能包含重复 `syncSpaceId + objectId`，重复对象直接进入 `rejected`，避免同批顺序语义影响幂等性。

`GET /sync/pull?cursor=...&limit=...` 响应：

```json
{
  "cursor": 100,
  "nextCursor": 102,
  "hasMore": false,
  "events": [
    {
      "id": 101,
      "syncSpaceId": "uuid",
      "eventType": "updated",
      "objectId": "uuid",
      "objectRevision": 4,
      "objectSnapshot": {}
    }
  ]
}
```

pull 语义：

1. `cursor` 使用账号级事件游标，也就是 `sync_events.id`，不使用对象 revision。
2. 事件必须按 `id` 升序返回，`limit` 有服务端上限。
3. `objectSnapshot` 是事件发生时的完整密文对象快照，包含 tombstone 状态，客户端不需要再查询当前对象才能重放事件。
4. 如果客户端 cursor 早于服务端保留边界，服务端返回 `cursor_expired`，客户端改用 `/sync/snapshot` 拉取当前完整快照。

`GET /sync/snapshot?syncSpaceId=...&pageToken=...` 响应：

```json
{
  "syncSpaceId": "uuid",
  "snapshotCursor": 102,
  "generatedAt": "2026-05-20T00:00:00Z",
  "wrappedVaultKeys": [
    {
      "id": "uuid",
      "vaultId": "uuid",
      "keyId": "vault-key-id",
      "wrapType": "user_wrapped",
      "generation": 3,
      "kdfParams": {},
      "wrappedVaultKey": {}
    }
  ],
  "objects": [
    {
      "objectId": "uuid",
      "vaultId": "uuid",
      "objectType": "vault_item",
      "revision": 4,
      "encryptedPayload": {},
      "deletedAt": null,
      "updatedAt": "2026-05-20T00:00:00Z"
    }
  ],
  "includesTombstones": true,
  "nextPageToken": null
}
```

snapshot 语义：

1. snapshot 返回当前服务端完整状态，用于首次同步、cursor 过期、本地状态损坏或重新安装后的恢复。
2. `snapshotCursor` 是生成快照时账号级事件流的最新 cursor。客户端完整应用 snapshot 后，把它保存为新的 pull 起点。
3. `wrappedVaultKeys` 只返回当前 active `user_wrapped` 包装记录。
4. `objects` 返回当前未清理的对象，包括未过保留窗口的 tombstone；被服务端清理掉的 tombstone 不再返回，客户端必须以 snapshot 为准删除本地多余对象。
5. 当对象数量超过响应上限时使用 `nextPageToken` 分页；同一次 snapshot 的后续分页必须保持同一个 `snapshotCursor`。

`POST /sync/ack` 请求：

```json
{
  "cursor": 102
}
```

ack 语义：

1. 服务端按 `accountId + deviceId` 保存设备已处理的最大 cursor。
2. ack 不删除数据，只更新设备同步进度。
3. tombstone 和旧事件清理必须参考所有活跃设备的 ack cursor。

### User console

```http
GET    /console/profile
PATCH  /console/profile
GET    /console/identities
DELETE /console/identities/:id
GET    /console/devices
DELETE /console/devices/:id
GET    /console/usage
```

### Admin console

```http
GET    /admin/accounts
GET    /admin/accounts/:id
PATCH  /admin/accounts/:id
GET    /admin/devices
DELETE /admin/devices/:id
GET    /admin/config
PATCH  /admin/config
GET    /admin/roles
POST   /admin/accounts/:id/roles
DELETE /admin/accounts/:id/roles/:role
GET    /admin/audit-logs
```

## PostgreSQL 结构

数据库结构以 `server/migrations` 下的 migration 为准，本文不再内联维护 SQL 草案，避免文档和实际实现漂移。

当前 migration：

1. `server/migrations/0001_auth_account.sql`：账号、登录态、设备绑定、设备 token scope、RBAC 和审计日志。
2. `server/migrations/0002_sync.sql`：同步协议 v1 表，包括同步空间、密文对象、增量事件、`wrappedVaultKey`、设备 cursor、幂等记录和实例配置。

开发阶段如果还没有需要兼容的已部署数据库，可以直接调整现有 migration；对外稳定后再通过新增 migration 演进，并在本节补充 migration 文件名和用途。

## 设备 token

设备 token 是同步 API 的主要凭据：

1. token 只在创建或交换时返回一次。
2. 服务端只保存 token hash。
3. token 可以撤销。
4. token 需要绑定 `accountId`、`deviceId` 和权限范围，例如 `sync:read`、`sync:write`、`device:manage`。
5. 桌面端应把 token 存在系统安全存储中。
6. Web session token 不能调用 `/sync/*`；它只能用于用户后台和 `POST /auth/device/bind`。
7. `POST /auth/device/bind` 只能用普通 Web session token 调用，不接受已有 `deviceToken` 继续派生新设备。

设备撤销边界：

1. 撤销设备只撤销该设备 token，阻止它继续调用 `/sync/*` 拉取或上传服务器数据。
2. 当前阶段不承诺远程擦除该设备本地已缓存的数据，也不因为撤销设备自动轮换 `vaultKey`。
3. 如果设备丢失或疑似被入侵，产品提示必须明确：撤销能阻止后续同步，但不能保证对方无法读取已经保存在该设备上的旧数据。

## 同步原则

1. 客户端离线优先。
2. 服务端只分配 revision、保存密文、返回增量。
3. 服务端不做明文合并。
4. 冲突处理仍在客户端完成。
5. 删除使用 tombstone，不直接物理删除。

### Revision 和 cursor

同步协议同时使用两种递增值：

1. `sync_objects.revision` 是对象级 revision。每个对象从 `1` 开始递增，用于 push 时的 `baseRevision` 冲突检测。
2. `sync_events.id` 是账号级事件游标。每次对象变更都会追加一条事件，客户端 pull 使用这个 id 作为 `cursor`。

对象更新规则：

```text
if client.baseRevision == server.object.revision:
  server.object.revision += 1
  append sync_event(id = next_account_event_id)
else:
  return conflict(serverObject)
```

`revision` 不用于拉取全局增量，`cursor` 不用于判断对象冲突。两者分离可以避免“对象级版本”和“账号级事件流”混在一起。

### sync space 边界

`sync_spaces` 是服务器账号下的同步空间，用来区分同一个服务器账号下的不同桌面端本地账号。当前阶段采用 `account_id -> sync_space_id -> vault_id -> object_id` 的边界：例如桌面端本地账号 `test1` 和 `test2` 使用同一个服务器账号时，服务端分别创建两个 sync space。

`sync_spaces.display_name` 可以明文保存桌面端本地账号名，方便 Web 后台查看和排查同步状态。同一服务器账号下 `account_id + display_name` 唯一，客户端创建同步空间时传当前本地账号名；服务端如果已存在同名空间，应返回已有空间，保证重复绑定和重试不会创建重复分区。

保险库名称、描述、条目摘要、附件信息等仍然属于用户数据，必须放入 `encrypted_metadata` 或 `sync_objects.encrypted_payload`，服务端不保存这些明文。这样可以在后台看清 `test1/test2` 的同步边界，又不破坏密码库内容的端到端加密。

### 事件快照

每条 `sync_events` 必须保存 `object_snapshot`，内容是事件发生时的完整密文对象视图：

```json
{
  "objectId": "uuid",
  "syncSpaceId": "uuid",
  "vaultId": "uuid",
  "objectType": "vault_item",
  "revision": 4,
  "encryptedPayload": {},
  "updatedByDeviceId": "uuid",
  "deletedAt": null,
  "updatedAt": "2026-05-20T00:00:00Z"
}
```

这样客户端按事件顺序重放时，不会因为服务端当前对象已经更新或删除而丢失当时的密文版本和 tombstone 状态。

### Tombstone 生命周期

删除对象时，服务端写入 `deletedAt` 并追加 `deleted` 事件，不立即物理删除。清理策略：

1. tombstone 至少保留一个固定窗口，例如 90 天。
2. tombstone 对应的删除事件必须被所有活跃设备 ack 后，才允许清理。
3. 长期未同步设备超过冷设备阈值，例如 180 天，可以标记为 stale；stale 设备再次上线时必须走 `/sync/snapshot` 全量恢复，不能从旧 cursor 继续增量。
4. 如果客户端提交的 cursor 早于服务端保留边界，服务端返回 `cursor_expired`，客户端清空本地远端镜像后拉取当前 snapshot。
5. 注销账号或用户主动删除服务端密文数据时，可以级联删除该账号的 sync spaces、objects、events 和 `wrappedVaultKey` 记录。

### 安全和防滥用约束

当前阶段需要把限制写进配置，并在服务端强制执行：

1. 单对象密文 payload 大小上限，例如 256 KiB；大附件走独立附件对象或后续 blob 存储，不塞进普通 item payload。
2. 单次 push 对象数上限，例如 100 个；单次 push 总 payload 上限，例如 5 MiB。
3. pull `limit` 上限，例如 500 条事件。
4. 账号存储配额、设备数量配额和每设备请求频率限制必须在 API 层执行。
5. 服务端必须校验 envelope 版本、算法白名单、nonce/tag/ciphertext 字段长度、objectType 白名单，以及 `aad.objectId`、`aad.vaultId`、`aad.revision`、`aad.purpose` 和外层同步元数据的一致性。
6. 生产环境 CORS 只允许配置的 Web origin；Web 后台如果使用 cookie 登录，写操作必须有 CSRF 防护。
7. 日志不能记录 bearer token、`wrappedVaultKey`、`encryptedPayload`、主密码、`recoveryKey` 或任何解密结果。

## 当前阶段实现顺序

1. 新建 `server` Rust 工程。
2. 接入 PostgreSQL、migration、健康检查。
3. 实现邮箱密码或本地开发登录，打通账号表。
4. 实现自建服务器 token 交换。
5. 实现设备 token、设备状态和 `/auth/me`。
6. 预留并验证 `sync_spaces` 和 `wrapped_vault_keys` API/存储语义；新设备恢复闭环待桌面端完整接入后再标为已完成。
7. 实现 `sync_objects`、`sync_events`、幂等 push、pull、ack 和 snapshot。
8. 实现 tombstone 生命周期、设备 cursor、配额和频率限制。
9. 增加 Web 登录页和用户后台。
10. 增加用户后台的设备、身份、token 和用量管理。
11. 增加 RBAC、管理员后台和审计日志。
12. 再接入手机短信、Google、微信；接入前相关入口保持预留/禁用。

这样可以先让桌面端完成真实同步闭环，再逐步增加复杂登录方式。
