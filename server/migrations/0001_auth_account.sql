-- 账号、登录、设备绑定和后台权限相关表。
-- 这组表刻意和同步密文表分开，后续如果需要可以把账号系统拆成独立服务。

-- 服务器账号主体：保存登录邮箱、显示名、密码哈希和账号状态。
create table if not exists accounts (
  id uuid primary key,
  display_name text not null,
  email text,
  password_hash text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  disabled_at timestamptz
);

-- 登录身份映射：用于把 email、Google、手机号等登录方式绑定到同一个账号。
create table if not exists account_identities (
  id uuid primary key, -- 登录身份记录 id。
  account_id uuid not null references accounts(id) on delete cascade, -- 绑定到哪个服务器账号。
  provider text not null, -- 登录方式，例如 email、google、phone。
  provider_subject text not null, -- 该登录方式下的唯一标识，例如邮箱、Google 用户 id、手机号。
  display_label text not null, -- 展示给用户看的登录身份名称，例如 user@example.com。
  created_at timestamptz not null, -- 绑定时间。
  unique (provider, provider_subject) -- 同一个登录身份只能绑定一个账号，避免重复注册。
);

-- Web 控制台登录态：只保存 session token hash 和过期时间。
create table if not exists auth_sessions (
  token_hash text primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null
);

-- OAuth 登录临时状态：用于校验 第三方登录回调流程。
create table if not exists oauth_states (
  id uuid primary key, -- OAuth 登录流程记录 id。
  provider text not null, -- 第三方登录来源，例如 google、github、wechat。
  state_hash text not null unique, -- OAuth state 的哈希，用来防 CSRF 和伪造回调。
  pkce_verifier_hash text, -- PKCE verifier 的哈希，用来校验授权码流程。
  account_id uuid references accounts(id) on delete cascade, -- 如果是给已有账号绑定第三方登录，这里记录账号 id。
  expires_at timestamptz not null, -- 登录流程过期时间。
  created_at timestamptz not null -- 创建时间。
);

-- 短信验证码临时记录：保存验证码 hash、尝试次数、过期和消费状态。
create table if not exists sms_codes (
  id uuid primary key,
  phone text not null,
  code_hash text not null,
  attempts integer not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null
);

-- 已绑定同步设备：保存 deviceToken hash、最后活跃时间和撤销状态。
create table if not exists devices (
  id uuid primary key, -- 设备 id，绑定设备时生成。
  account_id uuid not null references accounts(id) on delete cascade, -- 设备属于哪个服务器账号。
  client_device_id text, -- 客户端生成并持久保存的本机设备 id；同一账号下用于复用同一台电脑的设备记录。
  name text not null, -- 设备名称，例如 LockPass Windows Desktop。
  remark text, -- 用户给设备设置的备注名，例如 公司电脑、家里台式机；不影响客户端上报的设备名称。
  token_hash text not null unique, -- deviceToken 的哈希；服务端不保存 deviceToken 明文。
  token_scopes text[] not null default array['sync:read', 'sync:write'], -- deviceToken 权限范围，例如同步读写权限。
  last_seen_at timestamptz, -- 设备最近一次使用 deviceToken 调用服务端的时间。
  last_seen_ip text, -- 设备最近一次使用 deviceToken 调用服务端时记录到的客户端 IP。
  revoked_at timestamptz, -- 设备撤销时间；非空表示该 deviceToken 不能再用于同步。
  created_at timestamptz not null, -- 设备绑定时间。
  unique (account_id, id) -- 支持其他表用 (account_id, device_id) 做同账号外键校验。
);

-- 后台角色定义：用于区分普通用户、支持人员、管理员和实例所有者等角色。
create table if not exists roles (
  id uuid primary key,
  code text not null unique,
  name text not null,
  built_in boolean not null default false
);

-- 后台权限定义：每条记录代表一个可授权的后台操作能力。
create table if not exists permissions (
  id uuid primary key,
  code text not null unique,
  description text not null
);

-- 角色权限映射：描述某个角色包含哪些权限。
create table if not exists role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_id uuid not null references permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- 账号角色映射：描述某个账号被授予了哪些后台角色。
create table if not exists account_roles (
  account_id uuid not null references accounts(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  granted_by uuid references accounts(id) on delete set null,
  created_at timestamptz not null,
  primary key (account_id, role_id)
);

-- 管理员审计日志：记录后台敏感操作、目标和附加元数据。
create table if not exists admin_audit_logs (
  id bigserial primary key, -- 审计日志 id，自增生成。
  actor_account_id uuid references accounts(id) on delete set null, -- 操作人账号 id；账号被删除后保留日志，置为空。
  action text not null, -- 操作类型，例如 disable_account、grant_role、revoke_device。
  target_type text not null, -- 被操作对象类型，例如 account、device、role、config。
  target_id text, -- 被操作对象 id；用 text 是为了兼容 uuid、配置 key 等不同类型目标。
  metadata jsonb not null default '{}'::jsonb, -- 操作附加信息，例如变更前后状态、原因、请求来源等。
  created_at timestamptz not null -- 日志创建时间。
);

create index if not exists idx_account_identities_account_id on account_identities(account_id);
create index if not exists idx_auth_sessions_account_id on auth_sessions(account_id);
create index if not exists idx_devices_account_id on devices(account_id);
create unique index if not exists idx_devices_account_client_device_id on devices(account_id, client_device_id) where client_device_id is not null;
create index if not exists idx_admin_audit_logs_created_at on admin_audit_logs(created_at desc);
