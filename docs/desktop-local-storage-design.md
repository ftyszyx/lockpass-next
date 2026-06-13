# 桌面端本地存储方案

## 目标

桌面端本地存储使用 SQLite。SQLite 只负责可靠存储、事务、查询和迁移；安全边界仍然是客户端加密 envelope。主密码、恢复密钥、`vaultKey`、`deviceUnlockKey` 和同步 `deviceToken` 不能明文写入 SQLite。

本方案同时要求多用户数据隔离。一个本地用户的数据损坏、删除或迁移失败，不应影响其他用户。

## 目录结构

采用“全局元数据库 + 每个用户独立数据库”的文件级隔离：

```text
AppData/com.lockpass.next/
  app-meta.sqlite
  users/
    {userId}/
      vault.sqlite
      attachments/
        {attachmentId}.lpblob
```

`app-meta.sqlite` 只保存全局元信息：

1. 本机用户列表。
2. 当前选中的用户 `activeUserId`。
3. 语言、窗口布局等全局设置。

每个用户的 `vault.sqlite` 保存该用户自己的加密保险库对象、同步设置和对象索引。附件密文文件放在同一用户目录下的 `attachments/`，不与其他用户共享目录。

## 用户隔离原则

1. 一个用户一个 `vault.sqlite`，不把多个用户混在同一组业务表里再依赖 `user_id` 过滤。
2. 切换用户时必须释放当前用户的会话状态，清空内存里的 `vaultKey`、搜索索引、附件缓存和敏感 UI 状态，再打开目标用户数据。
3. “从此设备移除当前用户”只删除该用户目录、该用户在 `app-meta.sqlite` 中的记录，以及系统安全存储里的该用户密钥材料。
4. 同步 token、恢复密钥、快速解锁密钥仍然放系统安全存储，条目 key 必须包含 `userId`。

系统安全存储 key：

```text
lockpass-next:recovery-key:{userId}
lockpass-next-fast-unlock:{accountId}:{userId}:{deviceId}:{deviceKeyId}
lockpass-next-sync-device-token:{userId}
```

## 加密边界

SQLite 不是安全边界。即使用 SQLite，也不能把条目标题、URL、账号、文件名、备注、字段值、附件索引等业务内容明文写入普通列。

落库规则：

1. 业务内容使用 `vaultKey` 加密成 envelope 后保存。
2. `wrappedVaultKey` 使用 `unlockKey` 加密后保存。
3. 附件文件先加密为 `.lpblob` 再写入用户附件目录。
4. 允许明文保存的本地元数据必须最小化，例如对象 id、对象类型、revision、同步状态、更新时间、删除标记、密文大小。
5. 搜索索引第一版不落库；解锁后在内存中由密文解密结果构建。后续如果需要落库搜索索引，必须做加密索引或明确泄露边界。

## Migration 管理

桌面端 SQLite schema 迁移由 `refinery` 管理，并拆成 `app_meta` 和 `user_vault` 两套迁移。

```text
apps/desktop/src-tauri/migrations/
  app_meta/
    V1__init.sql
  user_vault/
    V1__init.sql
```

规则：

1. Rust 代码只负责打开连接、设置 SQLite pragma、调用对应 migration runner 和执行业务读写。
2. 建表、加列、建索引、数据回填等 schema 变更都必须新增 SQL migration 文件，不再在 Rust 里内联 `create table` / `alter table`。
3. `app_meta` 迁移只作用于 `app-meta.sqlite`，管理 `app_settings`、`users` 等全局元数据表。
4. `user_vault` 迁移只作用于每个用户的 `users/{userId}/vault.sqlite`，管理 `user_crypto`、`local_settings`、`sync_settings`、`encrypted_objects` 等用户级表。
5. `refinery` 使用自己的 `refinery_schema_history` 记录每个 SQLite 文件已经应用的 migration。不要再维护旧的手写 `schema_migrations` 表。
6. 应用启动加载全局状态前，必须先打开并迁移 `app-meta.sqlite`。
7. 创建新用户或打开某个用户时，必须先打开并迁移该用户的 `vault.sqlite`，再执行业务读写。
8. 迁移只向前，不做自动降级。已经发布的 migration 文件不得改写；需要修正时新增下一条 migration。

开发期重置策略：

1. 当前仍处于开发期，不为旧开发期 SQLite 表写兼容清理 migration。
2. 如果 schema 有破坏性调整，可以直接删除旧的 `app-meta.sqlite` 或用户目录下的 `vault.sqlite`，再由 `refinery` 按当前 migration 重新初始化。
3. `refinery_schema_history` 是唯一的 migration 状态来源；不要迁移或读取旧手写 `schema_migrations` 表。

## `app-meta.sqlite` schema

```sql
create table if not exists app_settings (
  key text primary key,
  value_json text not null,
  updated_at text not null
);

create table if not exists users (
  id text primary key,
  username text not null,
  display_name text not null,
  created_at text not null,
  updated_at text not null,
  vault_db_path text not null
);
```

`app_settings` key：

| key | 内容 |
| --- | --- |
| `activeUserId` | 当前选中的用户 id |
| `locale` | 当前语言 |
| `layout` | 桌面端布局设置 |
| `deviceId` | 本机设备 id |

## `vault.sqlite` schema

每个用户独立一份：

```sql
create table if not exists user_crypto (
  id text primary key,
  crypto_json text not null,
  updated_at text not null
);

create table if not exists local_settings (
  key text primary key,
  value_json text not null,
  updated_at text not null
);

create table if not exists sync_settings (
  id text primary key,
  mode text not null check (mode in ('official', 'selfhost')),
  server_url text not null,
  sync_space_id text,
  account_id text,
  account_label text,
  device_id text,
  cursor integer not null default 0,
  connected_at text,
  last_sync_at text,
  updated_at text not null
);

create table if not exists encrypted_objects (
  object_id text primary key,
  object_type text not null check (object_type in ('vault_metadata', 'vault_item', 'vault_attachment')),
  vault_id text not null,
  revision integer not null,
  base_revision integer not null,
  sync_state text not null check (sync_state in ('clean', 'dirty', 'pending', 'conflicted')),
  deleted_at text,
  updated_at text not null,
  key_id text not null,
  envelope_json text not null
);

create index if not exists encrypted_objects_vault_idx on encrypted_objects(vault_id);
create index if not exists encrypted_objects_sync_idx on encrypted_objects(sync_state, updated_at);
create index if not exists encrypted_objects_type_idx on encrypted_objects(object_type);
```

`encrypted_objects.envelope_json` 保存密文 envelope。`object_type`、`vault_id`、`revision` 和同步状态是为了同步和查询保留的明文元数据；这些字段的泄露边界要和 `docs/security-model.md` 中的元数据白名单保持一致。

附件文件本身写入 `users/{userId}/attachments/`。附件名称、MIME、大小、校验和和 blob 引用等业务元数据作为 `vault_attachment` 对象密文保存在 `encrypted_objects` 中，不单独建立明文附件索引表。

## 数据访问接口

前端 store 不应直接依赖 JSON 文件或 SQLite 细节。Tauri 侧负责 SQLite 文件、事务、迁移和附件路径校验；前端负责加解密、解锁会话状态和 UI 状态。

当前 Tauri 命令名仍保留：

```text
load_vault_store
save_vault_store
load_encrypted_objects
save_encrypted_objects
```

但语义已经改为：

1. `load_vault_store` / `save_vault_store` 只读写全局设置、用户索引、`user_crypto` 和 `sync_settings`。
2. 保险库、条目和附件元数据分别作为 `vault_metadata`、`vault_item`、`vault_attachment` 对象加密后写入 `encrypted_objects`。
3. 新附件字节写入 `users/{userId}/attachments/`，并返回 `local://users/{userId}/attachments/{attachmentId}.lpblob`。
4. `crypto.encryptedPayload` / `encrypt-desktop-user-payload-v1` 属于旧整包 profile 方案，当前实现禁止继续写入。

## 开发期重置策略

当前仍处于开发阶段，不兼容旧 `vault-store.json`。SQLite 存储上线时可以删除旧 JSON 存储和旧附件目录，然后初始化新的 SQLite 目录结构。

启动时按顺序判断：

1. 如果 `app-meta.sqlite` 存在且 schema 完整，走 SQLite。
2. 如果不存在 `app-meta.sqlite`，但存在 `vault-store.json` 或旧 `attachments/`，直接删除旧文件和旧目录。
3. 创建新的 `app-meta.sqlite`。
4. 用户重新走初始化或网页登录同步流程。

正式发布前如果已经有外部用户数据，再补充 JSON 到 SQLite 的兼容迁移；当前开发阶段不实现兼容迁移。

## 删除用户

“从此设备移除当前用户”需要删除：

1. `app-meta.sqlite.users` 中的该用户记录。
2. `users/{userId}/vault.sqlite`。
3. `users/{userId}/attachments/`。
4. 系统安全存储中的恢复密钥。
5. 系统安全存储中的快速解锁 key。
6. 系统安全存储中的同步 `deviceToken`。

删除前必须关闭或释放该用户 DB handle。删除后如果还有其他用户，切换到下一个用户并锁定；如果没有用户，回到初始化流程。

## 备份

本地 SQLite 不等于备份格式。备份包仍应使用独立的加密备份 envelope，不直接复制 `vault.sqlite` 给用户作为正式备份。

可选开发诊断备份可以导出：

```text
backup-debug/
  app-meta.sqlite
  users/{userId}/vault.sqlite
  users/{userId}/attachments/
```

用户可见的正式备份必须是加密、认证、可校验版本的包。

## 验收清单

1. 新装应用会创建 `app-meta.sqlite`，新用户会创建独立 `users/{userId}/vault.sqlite`。
2. 两套数据库都有 `refinery_schema_history`，并记录已应用的 migration。
3. 创建两个用户后，两个用户的 SQLite 文件和附件目录不同。
4. 切换用户后不能看到另一个用户的条目、附件或同步状态。
5. 删除当前用户只删除该用户目录和该用户系统安全存储项，不影响其他用户。
6. 开发期从旧 `vault-store.json` 启动时会直接删除旧 JSON 和旧 `attachments/`，并初始化 SQLite。
7. SQLite 中不能搜索到明文密码、明文恢复密钥、明文 `vaultKey` 或明文附件内容。
8. 附件文件仍是密文 `.lpblob`。
9. 同步连接、断开、立即同步和 deep link 登录绑定在 SQLite 存储下仍可用。
