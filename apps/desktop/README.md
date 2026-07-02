# LockPass Desktop

## tauri 配置
https://v2.tauri.app/reference/config/

## WebView 调试

普通开发启动：

```bash
npm run dev:desktop
```

如果需要检查 Tauri WebView 里的 DOM、控制台或事件流，使用带调试端口的启动方式：

```bash
npm run dev:desktop:debug
```

默认调试地址：

```text
http://127.0.0.1:9222/json
```

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

## 打包桌面端

Windows 安装包使用 Tauri 生成：

```bash
npm install
npm run -w @lockpass/desktop tauri:build
```

打包命令会先执行桌面端前端构建，然后编译 Rust 主程序并生成安装包。Windows 产物默认在：

```text
apps/desktop/src-tauri/target/release/bundle/nsis/LockPass Next_0.1.0_x64-setup.exe
```

正式发布推荐使用发布脚本，它会读取 `tools/pc_release.env`，注入桌面端官方服务器地址、updater 签名私钥，并生成/上传 `latest.json`：

```bash
Copy-Item tools/pc_release.env.example tools/pc_release.env
python tools/pc_release.py --upload
```

其中 `VITE_LOCKPASS_OFFICIAL_SERVER_URL` 是官方网页登录地址，`VITE_LOCKPASS_OFFICIAL_API_URL` 是官方同步 API 地址；这两个值会在打包时写进桌面端前端代码。
