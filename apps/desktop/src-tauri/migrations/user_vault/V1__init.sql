-- 单个用户的加密状态。
-- 这里只保存加密后的密钥 envelope 和 KDF 参数。
-- 禁止明文保存主密码、恢复密钥、vaultKey 或 deviceUnlockKey。
create table if not exists user_crypto (
  -- 稳定记录 id，例如 "default"。
  id text primary key,
  -- JSON 内容，包含 wrappedVaultKey、KDF 参数、keyId，以及可选的受信任设备快速解锁 envelope。
  crypto_json text not null,
  -- ISO-8601 时间，用于本地更新时间追踪。
  updated_at text not null
);

-- 单个用户的本地偏好设置。
-- 用于 UI、布局等用户本机状态，不保存共享同步状态。
create table if not exists local_settings (
  -- 设置名，例如 "selectedVaultId" 或 "layout"。
  key text primary key,
  -- JSON 编码后的设置值。
  value_json text not null,
  -- ISO-8601 时间，用于本地更新时间追踪。
  updated_at text not null
);

-- 单个用户的服务器同步配置和同步游标。
-- 敏感同步 token 必须保存到系统安全存储，不写入 SQLite。
create table if not exists sync_settings (
  -- 稳定记录 id，通常为 "default"。
  id text primary key,
  -- official 表示官方服务器；selfhost 表示用户自部署服务器。
  mode text not null check (mode in ('official', 'selfhost')),
  -- 当前同步模式使用的服务器基础地址。
  server_url text not null,
  -- 服务端同步空间 id，绑定当前本地用户。
  sync_space_id text,
  -- 服务端账号 id，用于展示和设备绑定。
  account_id text,
  -- 可读账号标识，例如邮箱或显示名。
  account_label text,
  -- 当前桌面端在服务端注册的设备 id。
  device_id text,
  -- 本地已经应用的最新服务端游标，用于增量同步。
  cursor integer not null default 0,
  -- 当前用户连接服务器的 ISO-8601 时间。
  connected_at text,
  -- 最近一次成功同步的 ISO-8601 时间。
  last_sync_at text,
  -- ISO-8601 时间，用于本地更新时间追踪。
  updated_at text not null
);

-- 加密业务对象。
-- 条目标题、URL、账号、备注、附件名称等业务内容必须放在 envelope_json 密文中。
-- 明文字段只保留同步和本地查询所需的最小元数据。
-- 没有单独的保险库表；保险库列表由 object_type = 'vault_metadata' 的对象解密得到。
create table if not exists encrypted_objects (
  -- 稳定对象 id，与同步服务端共享。
  object_id text primary key,
  -- vault_metadata 表示保险库记录；vault_item 表示条目记录；vault_attachment 表示附件元数据记录。
  object_type text not null check (object_type in ('vault_metadata', 'vault_item', 'vault_attachment')),
  -- 保险库 id，用于本地过滤和同步分组；这是有意保留的明文元数据。
  vault_id text not null,
  -- 当前对象在同步协议中的版本号。
  revision integer not null,
  -- 当前本地修改基于的版本号，用于冲突检测。
  base_revision integer not null,
  -- clean 表示已同步；dirty 表示有本地修改；pending 表示同步中；conflicted 表示需要用户解决冲突。
  sync_state text not null check (sync_state in ('clean', 'dirty', 'pending', 'conflicted')),
  -- 软删除时间；null 表示对象仍然有效。
  deleted_at text,
  -- ISO-8601 时间，用于本地更新时间追踪。
  updated_at text not null,
  -- envelope_json 使用的加密 key id。
  key_id text not null,
  -- AEAD envelope JSON，包含密文和认证元数据。
  envelope_json text not null
);

-- 主界面按保险库快速查询对象。
create index if not exists encrypted_objects_vault_idx on encrypted_objects(vault_id);

-- 快速查询需要同步或需要处理冲突的对象。
create index if not exists encrypted_objects_sync_idx on encrypted_objects(sync_state, updated_at);

-- 按加密对象类型快速查询。
create index if not exists encrypted_objects_type_idx on encrypted_objects(object_type);
