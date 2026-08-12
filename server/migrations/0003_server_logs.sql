-- 服务器运行日志：保存结构化 HTTP 请求结果，供管理后台排查问题。
-- 不保存请求体、响应体、认证令牌、主密码、安全密钥或保险库内容。
create table if not exists server_logs (
  id bigserial primary key,
  request_id uuid not null,
  level text not null,
  message text not null,
  account_id uuid references accounts(id) on delete set null,
  account_display_name text,
  account_email text,
  method text not null,
  path text not null,
  status_code integer not null,
  duration_ms bigint not null,
  client_ip text,
  created_at timestamptz not null,
  check (level in ('info', 'warning', 'error')),
  check (status_code between 100 and 599),
  check (duration_ms >= 0)
);

create index if not exists idx_server_logs_created_at on server_logs(created_at desc);
create index if not exists idx_server_logs_level_created_at on server_logs(level, created_at desc);
create index if not exists idx_server_logs_account_created_at on server_logs(account_id, created_at desc);
