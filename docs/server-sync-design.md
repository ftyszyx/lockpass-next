# 服务器端保存方案

## 目标

面向用户时，不再强调“同步”概念。用户只需要理解：

1. 进入桌面端后登录一个服务器账号。
2. 服务器可以是 LockPass 官方托管，也可以是用户自己的自建服务器。
3. 联网时，新增、编辑、删除密码条目会自动保存到服务器。
4. 断网时，数据先保存到本机；恢复联网后自动检查本机修改并立即补传。

技术实现仍然需要内部同步协议，但 `sync`、`cursor`、`revision`、`event` 等术语不应直接出现在普通用户界面里。界面只展示“未登录服务器账号”“等待保存到服务器”“已保存到服务器”“服务器版本有冲突”等状态。

服务器不保存用户主密码、安全密钥、`unlockKey`、`vaultKey` 或条目明文。服务端只保存账号、设备、密文对象和必要的版本元数据。

## 用户流程

### 首次使用

1. 用户创建或解锁本机保险库。
2. 如果还没有登录服务器账号，桌面端引导用户登录。
3. 用户选择官方托管或自建服务器。
4. 登录成功后，桌面端绑定当前设备并保存设备 token。
5. 之后所有条目变更自动保存到服务器。

桌面端不直接保存服务器长期密码凭据。登录在 Web 页面完成，Web 登录成功后通过设备绑定回调把长期 `deviceToken` 交给桌面端。

### 联网保存

用户保存条目时：

1. 桌面端先把修改加密保存到本机，避免网络问题导致用户输入丢失。
2. 如果已登录服务器账号且网络可用，立即上传该条目的密文对象。
3. 服务器检查对象版本。
4. 成功后，客户端把本地状态标记为“已保存到服务器”。
5. 如果服务器版本已变化，进入冲突处理。

用户不需要点击“同步”。手动入口只叫“立即检查”，用于用户想主动检查服务器保存状态。

### 断网保存

断网时：

1. 桌面端仍允许新增、编辑、删除。
2. 所有修改先保存到本机密文库，并标记为待保存。
3. 恢复联网、窗口回到前台、应用解锁后，客户端自动检查待保存修改。
4. 有待保存修改时立即上传；同时拉取服务器变化。

### 多端修改冲突

参考 1Password 和 Bitwarden 的产品思路：不要把复杂冲突模型暴露给用户，也不要默默覆盖用户数据。

LockPass 第一版采用以下策略：

1. 保存前带上客户端看到的 `baseRevision`。
2. 如果服务器当前 revision 没变，直接保存。
3. 如果服务器当前 revision 已变化，服务器返回冲突，不覆盖任何一方。
4. 客户端拉取服务器版本，在本地尝试自动处理。
5. 如果能明确安全合并，例如不同字段修改，可以生成合并后的新版本再保存。
6. 如果不能安全合并，保留本机修改和服务器版本，生成“冲突副本”或进入“需要处理”状态。
7. 每次成功保存都保留历史版本，用户可以查看和恢复。

服务端不解密条目，所以服务端不做字段级合并。自动合并只能在已解锁的客户端完成。

## 账号和设备模型

账号以服务器账号为准，桌面端不再设计另一套独立账号系统。本机只保存该服务器账号在当前设备上的加密数据缓存、解锁材料状态、设备设置和离线待保存修改。

```text
account
  ├─ identity: email / phone / google / wechat
  ├─ device: Windows / macOS / Linux / future mobile
  └─ encrypted vault objects + local device cache
```

说明：

1. 邮箱验证码是第一版优先支持的服务器账号创建和登录方式；主密码只用于本地解锁保险库，不作为服务器长期密码凭据。
2. 手机短信、Google、微信只保留配置和入口，接入前默认禁用。
3. 同一设备上可以切换不同服务器账号，但每个账号的数据缓存、密钥材料和待保存修改必须隔离。
4. 设备绑定后，桌面端只使用 `deviceToken` 调用保存接口。
5. Web session token 只用于用户 Web 端登录态、管理员后台和设备绑定，不能直接调用密文保存接口；用户 Web 端需要换取受限的 Web device token 或同等范围的 vault access token 后才能调用密文保存接口。

## 数据表

第一版保留以下表，命名可以继续使用当前 migration 中的 `sync_*` 技术名，但后台和桌面端用户文案不要直接展示这些技术名。

| 表 | 用途 |
| --- | --- |
| `accounts` | 服务器账号主体 |
| `account_identities` | 邮箱、手机、OAuth 等登录身份 |
| `email_challenges` | 邮箱验证码 challenge，保存验证码哈希、过期时间和尝试次数 |
| `auth_sessions` | Web 登录态 |
| `devices` | 已绑定设备、设备 token hash、最近活动信息 |
| `sync_spaces` | 账号下的数据空间。第一版可每个服务器账号使用一个默认空间，后续用于团队、共享库或多工作区 |
| `wrapped_vault_keys` | 用用户本地 `unlockKey` 包裹后的 `vaultKey` 密文 |
| `sync_objects` | 当前密文对象、revision、删除标记 |
| `sync_events` | 密文对象历史事件，用于增量拉取和历史版本 |
| `device_sync_cursors` | 每个设备已确认处理到的位置 |
| `sync_idempotency_keys` | 防止重复提交造成重复写入 |
| `instance_config` | 实例配置，例如登录方式开关、配额、公开访问地址 |
| `roles` / `permissions` | 后台权限 |
| `account_roles` | 账号角色绑定 |
| `admin_audit_logs` | 管理员操作审计 |

第一版不再用 `sync_spaces.display_name` 区分桌面端本地账号名。账号边界就是服务器账号本身；默认空间可以命名为 `default`。如果后续支持团队空间、共享库或多工作区，再把 `sync_spaces` 作为账号下的空间边界。保险库名称、条目标题、URL、备注、字段值、附件文件名等仍然必须加密。

## API 边界

用户可理解为“保存到服务器”，技术 API 可以继续按 sync 命名：

```http
POST /auth/email/start
POST /auth/email/verify
POST /auth/account/complete
POST /auth/device/bind
POST /auth/logout
GET  /auth/me

GET    /devices
PATCH  /devices/:id
DELETE /devices/:id

GET  /sync/spaces
POST /sync/spaces
GET  /sync/wrapped-vault-keys?syncSpaceId=...
POST /sync/wrapped-vault-keys
GET  /sync/snapshot?syncSpaceId=...
POST /sync/push
GET  /sync/pull?cursor=...
POST /sync/ack
```

规则：

1. `/sync/*` 只接受设备 token，不接受普通 Web session token。
2. `/sync/*` 只接收和返回密文对象，不接收条目明文字段。
3. 客户端上传必须带 `baseRevision`。
4. 服务端只做版本检查、结构校验、配额限制、密文保存和事件记录。
5. 服务端不做明文合并。
6. 网站创建账号流程见 `web-account-creation-flow.md`；服务端不能接收主密码或 Secret Key 明文。

## 保存协议

### 上传修改

客户端上传一个或多个密文对象：

```text
client sends: objectId, vaultId, objectType, baseRevision, encryptedPayload, deletedAt
server checks: currentRevision == baseRevision
if ok:
  write sync_objects
  append sync_events
  return accepted + new revision
else:
  return conflict + current server object
```

同一批对象允许部分成功。成功对象进入 `accepted`；版本不匹配进入 `conflicts`；格式、配额或权限问题进入 `rejected`。

### 拉取变化

客户端需要在以下时机拉取服务器变化：

1. 登录服务器账号后。
2. 应用解锁后。
3. 恢复联网后。
4. 窗口回到前台后。
5. 手动点击“立即检查”后。
6. 上传成功或冲突后。

正常情况使用增量事件；本地状态损坏、首次登录、长期未上线或 cursor 过期时，使用 snapshot 拉取当前完整密文状态。

### 删除

删除不立即物理删除。服务端写入 tombstone：

1. `sync_objects.deleted_at` 标记删除。
2. `sync_events` 追加 deleted 事件。
3. tombstone 至少保留固定窗口，例如 90 天。
4. 所有活跃设备都确认处理后，才允许清理旧 tombstone。

## 冲突和历史版本

第一版目标是“少打扰，但不丢数据”。

### 服务端职责

服务端只判断 revision：

```text
if client.baseRevision == server.revision:
  accept
else:
  conflict
```

服务端返回当前服务器密文对象，客户端解密后决定如何处理。

### 客户端职责

客户端处理冲突：

1. 如果本机修改和服务器修改可以安全合并，自动合并并保存新版本。
2. 如果不能安全合并，创建冲突副本或提示用户处理。
3. 冲突提示必须说明“服务器上已有更新，已保留你的本机修改”。
4. 不能直接用最后写入覆盖另一端。

### 历史版本

`sync_events.object_snapshot` 保存每次成功写入后的完整密文对象快照。用户恢复历史版本时，本质是客户端选择某个历史密文，解密展示后重新保存为新 revision。

服务端可以按保留策略清理旧历史，例如：

1. 免费或自部署默认保留最近 N 个版本。
2. 官方托管可按套餐保留更长时间。
3. tombstone 和历史事件清理必须不破坏仍活跃设备的恢复能力。

## 新设备恢复和密钥材料

设备 token 只表示“这台设备可以访问服务器密文数据”，不能解密保险库。

新设备要解密，还需要：

1. 用户输入主密码。
2. 用户输入或从受信任设备带来的安全密钥（`recoveryKey`）。
3. 客户端用主密码 + 安全密钥派生 `unlockKey`。
4. 客户端从服务端下载 `wrappedVaultKey`，并在本机解开得到 `vaultKey`。

服务端可以保存：

1. `wrappedVaultKey`。
2. KDF 参数。
3. `keyId`、`vaultId`、generation。

服务端不能保存：

1. 主密码。
2. 安全密钥明文。
3. `unlockKey`。
4. `vaultKey` 明文。
5. 条目明文。

当前阶段如果新设备完整恢复闭环尚未完成，用户文案不能承诺“登录服务器账号即可恢复所有密码”。应明确仍需要主密码和安全密钥。

## 用户 Web 端与管理员后台

普通用户 Web 端是保险库应用，复用桌面端保险库体验和客户端加密核心。用户数据以服务器为准，浏览器本地只保存密文缓存、cursor 和待保存队列。用户 Web 端解锁必须在浏览器本地完成：用户输入主密码和安全密钥，浏览器派生 `unlockKey`，解开 `wrappedVaultKey` 得到 `vaultKey`，再解密密文条目。服务器不能获得主密码、安全密钥、`unlockKey`、`vaultKey` 或条目明文。

用户 Web 端建议页面：

| 页面 | 内容 |
| --- | --- |
| 保险库 | 登录、银行卡、笔记、附件等条目的创建、编辑、查看和删除 |
| 设备 | 当前账号的受信任设备和 Web 会话，支持撤销 |
| 保存状态 | 已保存到服务器、等待保存到服务器、冲突和最近检查时间 |
| 设置 | 语言、自动锁定、服务器账号、显示安全密钥入口 |

管理员后台由 `apps/admin_web` 提供，普通用户无法查看。管理员后台只管理服务器账号、设备、实例配置、审计日志和密文元数据，不做网页版密码库，不查看、不搜索、不导出、不解密用户 vault 内容。

管理员后台建议页面：

| 页面 | 内容 |
| --- | --- |
| 用户 | 查询账号、禁用/恢复账号、查看设备和用量 |
| 设备 | 查看异常设备、撤销设备 |
| 实例配置 | 登录方式开关、公开地址、配额 |
| 审计日志 | 管理员操作、登录失败、敏感配置变更 |

管理员后台不能查看、搜索、导出或解密用户 vault 内容。

## 安全和防滥用

1. 单对象密文 payload 设置大小上限，例如 256 KiB。
2. 单次上传对象数设置上限，例如 100 个。
3. 单次上传总 payload 设置上限，例如 5 MiB。
4. 拉取 limit 设置服务端上限，例如 500 条事件。
5. 服务端校验 envelope 版本、算法白名单、nonce/tag/ciphertext 字段长度、objectType 白名单。
6. 服务端校验 `aad.objectId`、`aad.vaultId`、`aad.revision`、`aad.purpose` 和外层元数据一致。
7. 生产 CORS 只允许配置的 Web origin。
8. 用户 Web 端和管理员后台如果使用 cookie 登录，写操作必须有 CSRF 防护。
9. 日志不能记录 bearer token、`wrappedVaultKey`、`encryptedPayload`、主密码、安全密钥或任何解密结果。

## 实现顺序

1. 账号创建和登录：邮箱验证码流程，见 `web-account-creation-flow.md`。
2. 设备绑定：网页登录后回调桌面端，保存设备 token。
3. 数据空间：服务器账号创建或复用默认 `sync_spaces`，本机只保存该账号的本地缓存。
4. 自动保存：实现 `/sync/push`，保存密文对象和 revision。
5. 自动检查：实现 `/sync/pull` 和 `/sync/ack`。
6. 首次和异常恢复：实现 `/sync/snapshot`。
7. 冲突保护：revision 不匹配时返回服务器版本，客户端保留冲突副本。
8. 历史版本：保留 `sync_events.object_snapshot`，支持恢复旧版本。
9. 删除生命周期：实现 tombstone 保留和清理。
10. 用户 Web 端：保险库、设备、保存状态、账号设置；管理员后台：账号、设备、实例配置、审计日志。
11. 新设备恢复：完善 `wrappedVaultKey` 下载、解包和端到端验收。
12. 后续再接入短信、Google、微信等登录方式。

第一阶段最重要的是把体验做简单：用户登录服务器账号后，联网自动保存，断网本机可用，恢复联网自动补传，冲突时不丢数据。
