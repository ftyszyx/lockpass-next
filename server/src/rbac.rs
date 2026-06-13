pub const ROLE_USER: &str = "user";
pub const ROLE_ADMIN: &str = "admin";

pub const PERMISSIONS: &[(&str, &str)] = &[
    ("account:read", "查看账号状态"),
    ("account:disable", "禁用或恢复账号"),
    ("device:read", "查看设备"),
    ("device:revoke", "撤销设备"),
    ("quota:write", "修改配额"),
    ("config:read", "查看实例配置"),
    ("config:write", "修改登录、OAuth 和短信配置"),
    ("role:read", "查看角色和权限"),
    ("role:write", "分配角色"),
    ("audit:read", "查看审计日志"),
];

pub const ROLES: &[(&str, &str)] = &[(ROLE_USER, "普通用户"), (ROLE_ADMIN, "管理员")];

const ADMIN_PERMISSIONS: &[&str] = &[
    "account:read",
    "account:disable",
    "device:read",
    "device:revoke",
    "quota:write",
    "config:read",
    "config:write",
    "role:read",
    "role:write",
    "audit:read",
];

const USER_PERMISSIONS: &[&str] = &[];

pub fn is_admin_role(role: &str) -> bool {
    role == ROLE_ADMIN
}

pub fn can_manage_roles(role: &str) -> bool {
    role == ROLE_ADMIN
}

pub fn permissions_for_role(role: &str) -> &'static [&'static str] {
    match role {
        ROLE_ADMIN => ADMIN_PERMISSIONS,
        ROLE_USER => USER_PERMISSIONS,
        _ => USER_PERMISSIONS,
    }
}
