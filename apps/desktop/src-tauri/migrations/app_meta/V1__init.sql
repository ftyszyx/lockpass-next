-- 全局应用设置。
-- 这张表只保存跨用户共享的本机设置，例如当前用户、语言、窗口布局和本机 deviceId。
-- 用户自己的保险库数据、同步状态和加密对象不放在这里。
create table if not exists app_settings (
  -- 设置名，例如 "activeUserId"、"locale"、"layout" 或 "deviceId"。
  key text primary key,
  -- JSON 编码后的设置值。
  value_json text not null,
  -- ISO-8601 时间，用于本地更新时间追踪。
  updated_at text not null
);

-- 本机用户索引。
-- 每个用户拥有独立的 vault.sqlite，这张表只记录用户入口和数据库路径。
create table if not exists users (
  -- 本机用户 id，也是用户目录名的一部分。
  id text primary key,
  -- 用户名，主要用于本地列表展示和识别。
  username text not null,
  -- 用户显示名；新建时可以为空字符串，由用户后续填写。
  display_name text not null,
  -- 用户在本机创建的 ISO-8601 时间。
  created_at text not null,
  -- 用户记录最近更新的 ISO-8601 时间。
  updated_at text not null,
  -- 该用户独立 vault.sqlite 的路径。
  -- 业务数据不写入 app-meta.sqlite，而是通过这个路径打开用户自己的数据库。
  vault_db_path text not null
);
