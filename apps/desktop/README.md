# LockPass Desktop

## tauri 配置
https://v2.tauri.app/reference/config/


## 本地数据位置

桌面端使用 Tauri 的应用数据目录保存本机数据。当前应用标识是 `com.lockpass.next`，Windows 开发环境下目录通常是：

```text
%APPDATA%\com.lockpass.next
```

在当前机器上对应：

```text
C:\Users\pc\AppData\Roaming\com.lockpass.next
```

主要文件：

```text
app-meta.sqlite
users\<user_id>\vault.sqlite
users\<user_id>\attachments\
```

- `app-meta.sqlite`：全局应用元数据，例如当前用户、语言、布局、本机 deviceId 和本机用户索引。
- `users\<user_id>\vault.sqlite`：单个本机用户的加密保险库数据、同步设置和加密对象索引。
- `users\<user_id>\attachments\`：该用户的本地加密附件数据。
