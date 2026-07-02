# LockPass Next

LockPass Next 是 LockPass 的全新重写版本。当前阶段优先实现桌面端密码管理器、普通用户 Web 保险库、开源同步服务器和管理员后台基础能力，使用 Tauri 2、Vue、Tailwind CSS、TypeScript、Rust 和 PostgreSQL 构建端到端加密、可保存到服务器、可自部署的个人密码管理工具。

当前开发重点是桌面端、用户 Web 端、本地缓存模型、安全边界、同步协议、开源服务器端和管理员后台。移动端、浏览器插件、多人共享保险库和完整托管商业化能力仍属于后续阶段。

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
| Desktop | Tauri 2 + Vue + Tailwind CSS + TypeScript | 桌面应用，负责窗口、托盘、全局快捷键、本地文件和系统集成 |
| Web | Vue + Tailwind CSS + TypeScript | 普通用户 Web 保险库，复用保险库体验，服务器数据为准，浏览器本地只保存密文缓存 |
| Core | TypeScript packages | 领域模型、加密封装、迁移、同步协议和业务命令 |
| Server | 开源 API 服务 + PostgreSQL | 保存账户、设备、同步元数据和密文数据，不保存明文和可解密密钥 |
| Admin Web | Vue + Tailwind CSS + TypeScript | 管理员后台，只允许管理员查看和管理实例元数据 |
| Database | SQLite / PostgreSQL | 桌面端使用本地 SQLite，服务器端使用 PostgreSQL |

后端框架先不与产品协议强绑定。实现时优先选择能稳定交付、方便自部署、便于共享 TypeScript 类型的方案。

## 仓库结构

```text
apps/
  desktop/   Tauri 2 桌面端
  web/       普通用户 Web 保险库
  server/    Rust + Axum 开源同步服务器
  admin_web/ Vue + TypeScript 管理员后台
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



## 本地开发

### 桌面端

```bash
npm install
npm run dev:desktop
```

需要调试 Tauri WebView 时使用：

```bash
npm run dev:desktop:debug
```

启动后可以访问 `http://127.0.0.1:9222/json`，用于连接 WebView2 调试端口。

### 服务器端

```bash
npm run dev:server
```

### 用户 Web 端

```bash
npm run dev:web
```

用户 Web 端使用服务器数据作为权威来源，浏览器本地只作为密文缓存和待保存队列。

### 管理员后台

```bash
npm run dev:admin_web
```

### Landing page

```bash
npm run dev:landing
npm run build:landing
```
