-- LockPass 密文同步协议 v1 表。
-- 依赖 0001_auth_account.sql 中的 accounts 和 devices。

-- PostgreSQL 扩展：用于 gen_random_uuid() 等数据库侧随机能力。
create extension if not exists pgcrypto;

-- 技术同步空间：账号下的数据分区。第一版每个服务器账号只使用 default 空间；普通用户界面不展示“同步空间”概念。
create table if not exists sync_spaces (
  id uuid primary key, -- 技术空间 id。
  account_id uuid not null references accounts(id) on delete cascade, -- 技术空间属于哪个服务器账号。
  display_name text not null default 'default', -- 第一版固定为 default；不要写入桌面端本地用户名或保险库名称。
  encrypted_metadata jsonb not null default '{}'::jsonb, -- 技术空间密文元数据；保险库名称、描述等用户数据仍然放这里。
  created_at timestamptz not null, -- 同步空间创建时间。
  updated_at timestamptz not null, -- 同步空间最后更新时间。
  unique (account_id, id) -- 支持其他表用 (account_id, sync_space_id) 做同账号外键校验。
);

-- 密文对象当前状态：保存条目、保险库元数据、附件等对象的最新密文和对象级 revision。
create table if not exists sync_objects (
  id uuid primary key, -- 同步对象 id，对应客户端对象的稳定 id。
  account_id uuid not null references accounts(id) on delete cascade, -- 对象属于哪个服务器账号。
  sync_space_id uuid not null, -- 对象属于哪个同步空间。
  vault_id uuid not null, -- 对象所属保险库 id。
  object_type text not null, -- 对象类型，例如 vault_metadata、vault_item、vault_attachment。
  revision bigint not null, -- 对象当前 revision，用于冲突检测。
  encrypted_payload jsonb not null, -- 对象密文 payload；服务端不解密。
  payload_bytes integer not null, -- 密文 payload 大小，用于配额和滥用限制。
  updated_by_device_id uuid not null, -- 最后更新该对象的设备 id。
  deleted_at timestamptz, -- 删除时间；非空表示 tombstone。
  updated_at timestamptz not null, -- 对象最后更新时间。
  foreign key (account_id, sync_space_id) references sync_spaces(account_id, id) on delete cascade, -- 确保同步空间属于同一账号。
  foreign key (account_id, updated_by_device_id) references devices(account_id, id), -- 确保更新设备属于同一账号。
  unique (account_id, sync_space_id, id), -- 同一账号、同一同步空间内对象 id 唯一。
  check (revision >= 1), -- revision 从 1 开始。
  check (payload_bytes >= 0) -- payload 大小不能为负数。
);

-- 增量同步事件：每次对象变更追加一条事件，客户端用事件 id 作为账号级 pull cursor。
create table if not exists sync_events (
  id bigserial primary key, -- 账号级增量事件 id，客户端 pull 时作为 cursor。
  account_id uuid not null references accounts(id) on delete cascade, -- 事件属于哪个服务器账号。
  sync_space_id uuid not null, -- 事件属于哪个同步空间。
  object_id uuid not null, -- 发生变更的同步对象 id。
  object_revision bigint not null, -- 事件发生后对象的 revision。
  base_revision bigint not null, -- 客户端提交时基于的 revision，用于解释冲突和变更来源。
  event_type text not null, -- 事件类型，例如 created、updated、deleted。
  object_snapshot jsonb not null, -- 事件发生时的对象快照，用于客户端恢复增量状态。
  created_at timestamptz not null, -- 事件创建时间。
  foreign key (account_id, sync_space_id) references sync_spaces(account_id, id) on delete cascade, -- 确保同步空间属于同一账号。
  check (event_type in ('created', 'updated', 'deleted')) -- 限制事件类型，避免客户端收到无法理解的事件。
);

-- wrappedVaultKey 记录：保存用用户本地 unlockKey 包裹后的 vaultKey 密文和 KDF 参数。
create table if not exists wrapped_vault_keys (
  id uuid primary key, -- wrappedVaultKey 记录 id。
  account_id uuid not null, -- 所属服务器账号 id。
  sync_space_id uuid not null, -- 所属同步空间 id。
  vault_id uuid not null, -- 被包裹的 vaultKey 对应哪个保险库。
  key_id text not null, -- vaultKey 的 key id，用于和密文 payload 中的 keyId 对应。
  wrap_type text not null, -- 包裹方式；当前只支持 user_wrapped。
  generation bigint not null default 1, -- 密钥代数，后续轮换 vaultKey 时递增。
  kdf_params jsonb not null, -- 派生 unlockKey 所需的 KDF 参数。
  wrapped_vault_key jsonb not null, -- 使用 unlockKey 加密后的 vaultKey 密文。
  created_by_device_id uuid, -- 创建这条 wrappedVaultKey 的设备 id。
  created_at timestamptz not null, -- 创建时间。
  revoked_at timestamptz, -- 撤销时间；非空表示这条密钥包不再使用。
  foreign key (account_id) references accounts(id) on delete cascade, -- 账号删除时清理密钥包。
  foreign key (account_id, sync_space_id) references sync_spaces(account_id, id) on delete cascade, -- 确保同步空间属于同一账号。
  foreign key (account_id, created_by_device_id) references devices(account_id, id), -- 确保创建设备属于同一账号。
  check (wrap_type = 'user_wrapped'), -- 当前阶段只允许用户派生密钥包裹。
  check (generation >= 1) -- generation 从 1 开始。
);

-- 设备同步游标：记录每个设备已确认处理到的账号级事件 cursor。
create table if not exists device_sync_cursors (
  account_id uuid not null, -- 所属服务器账号 id。
  device_id uuid not null, -- 设备 id。
  cursor bigint not null default 0, -- 该设备已经 ack 的最大 sync_events.id。
  acked_at timestamptz not null, -- 最近一次 ack 时间。
  foreign key (account_id) references accounts(id) on delete cascade, -- 账号删除时清理设备游标。
  foreign key (account_id, device_id) references devices(account_id, id) on delete cascade, -- 确保设备属于同一账号。
  primary key (account_id, device_id) -- 每个账号下每台设备只有一条游标。
);

-- 同步幂等记录：保存每个设备 push 操作的幂等响应，避免重试造成重复写入。
create table if not exists sync_idempotency_keys (
  account_id uuid not null, -- 所属服务器账号 id。
  device_id uuid not null, -- 发起 push 的设备 id。
  client_batch_id uuid not null, -- 客户端生成的批次 id，用于标识一次 push。
  client_operation_id uuid not null, -- 客户端生成的操作 id，用于标识批次内单个对象操作。
  response jsonb not null, -- 该操作第一次执行后的响应，重试时直接复用。
  created_at timestamptz not null, -- 幂等记录创建时间。
  foreign key (account_id) references accounts(id) on delete cascade, -- 账号删除时清理幂等记录。
  foreign key (account_id, device_id) references devices(account_id, id) on delete cascade, -- 确保设备属于同一账号。
  primary key (account_id, device_id, client_batch_id, client_operation_id) -- 同一设备同一操作只能记录一次。
);

-- 实例配置：保存注册开关、配额、登录能力等服务器级配置。
create table if not exists instance_config (
  key text primary key, -- 配置项 key，例如 allow_registration、max_devices_per_account。
  value jsonb not null, -- 配置项值，使用 jsonb 兼容布尔、数字和对象配置。
  updated_at timestamptz not null -- 配置项最后更新时间。
);

create index if not exists idx_wrapped_vault_keys_account_space on wrapped_vault_keys(account_id, sync_space_id);
create unique index if not exists idx_sync_spaces_account_display_name on sync_spaces(account_id, display_name);
create unique index if not exists idx_wrapped_vault_keys_active on wrapped_vault_keys(account_id, sync_space_id, vault_id, key_id) where revoked_at is null;
create index if not exists idx_sync_objects_account_space_revision on sync_objects(account_id, sync_space_id, revision);
create index if not exists idx_sync_events_account_id_id on sync_events(account_id, id);
create index if not exists idx_sync_events_account_space_id on sync_events(account_id, sync_space_id, id);
