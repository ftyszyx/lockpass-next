# LockPass Next

LockPass Next 是 LockPass 的全新重写版本。当前阶段优先实现桌面端密码管理器，并同步建设开源同步服务器和服务器后台基础能力，使用 Tauri 2、Vue、Tailwind CSS、TypeScript、Rust 和 PostgreSQL 构建本地优先、端到端加密、可同步、可自部署的个人密码管理工具。

当前开发重点是桌面端、本地数据模型、安全边界、同步协议、开源服务器端和服务器后台。移动端、浏览器插件、多人共享保险库和完整托管商业化能力仍属于后续阶段。

## 目标

1. 桌面端优先：当前阶段使用 Tauri 2 覆盖 Windows、macOS 和 Linux。
2. 本地优先：默认离线可用，本地数据库保存密文数据。
3. 端到端加密：同步服务器和数据库只能看到密文、版本号和必要元数据。
4. 可同步：提供开源服务器端和服务器后台，用户可以自部署；官方托管同步服务仍按同一协议后续演进。
5. 可迁移：数据库 schema、密文格式、同步协议和备份格式都必须版本化。
6. 可审计：安全模型、迁移策略、服务器边界和关键威胁写入文档。

## 技术方向

| 模块 | 技术栈 | 说明 |
| --- | --- | --- |
| Desktop | Tauri 2 + Vue + Tailwind CSS + TypeScript | 当前阶段主应用，负责窗口、托盘、全局快捷键、本地文件和系统集成 |
| Core | TypeScript packages | 领域模型、加密封装、迁移、同步协议和业务命令 |
| Server | 开源 API 服务 + PostgreSQL | 保存账户、设备、同步元数据和密文数据，不保存明文和可解密密钥 |
| Database | SQLite / PostgreSQL | 桌面端使用本地 SQLite，服务器端使用 PostgreSQL |

后端框架先不与产品协议强绑定。实现时优先选择能稳定交付、方便自部署、便于共享 TypeScript 类型的方案。

## 仓库结构

```text
apps/
  desktop/   Tauri 2 桌面端
  server/    Rust + Axum 开源同步服务器
  server_web/ Vue + TypeScript 同步服务器后台
packages/
  core/      领域模型、业务命令、迁移接口
  crypto/    KDF、密文 envelope、加解密 provider 接口
  sync/      同步协议、冲突处理、远端 adapter 类型
  ui/        Vue 组件约定、设计 token、Tailwind preset
docs/
  architecture.md
  product-vision.md
  security-model.md
```

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

## 本地开发

### 桌面端

```bash
npm install
npm run dev:desktop
```

桌面端官方服务器地址是编译期配置，默认指向本地服务器后台前端：

```bash
VITE_LOCKPASS_OFFICIAL_SERVER_URL=http://127.0.0.1:1432
VITE_LOCKPASS_OFFICIAL_API_URL=http://127.0.0.1:1480
```

`VITE_LOCKPASS_OFFICIAL_SERVER_URL` 是官方网页登录地址，`VITE_LOCKPASS_OFFICIAL_API_URL` 是官方同步 API 地址。示例见 `apps/desktop/.env.example`。


### 服务器端

```bash
npm run dev:server
```

服务端必须配置 `server/.env` 中的 `DATABASE_URL`。

### 服务器管理后台

```bash
npm run dev:server_web
```

### Landing page

```bash
npm run dev:landing
npm run build:landing
```
