# LockPass Next

LockPass Next 是 LockPass 的全新重写版本。当前阶段优先实现桌面端密码管理器、普通用户 Web 保险库、开源同步服务器和管理员后台基础能力，使用 Tauri 2、Vue、Tailwind CSS、TypeScript、Rust 和 PostgreSQL 构建端到端加密、可保存到服务器、可自部署的个人密码管理工具。

当前开发重点是桌面端、用户 Web 端、本地缓存模型、安全边界、同步协议、开源服务器端和管理员后台。移动端、浏览器插件、多人共享保险库和完整托管商业化能力仍属于后续阶段。

## 技术方向

| 模块 | 技术栈 | 说明 |
| --- | --- | --- |
| Desktop | Tauri 2 + Vue + Tailwind CSS + TypeScript | 桌面应用，负责窗口、托盘、全局快捷键、本地文件和系统集成 |
| Web | Vue + Tailwind CSS + TypeScript | 普通用户 Web 保险库，复用保险库体验，服务器数据为准，浏览器本地只保存密文缓存 |
| Core | TypeScript packages | 领域模型、加密封装、迁移、同步协议和业务命令 |
| Server | 开源 API 服务 + PostgreSQL | 保存账户、设备、同步元数据和密文数据，不保存明文和可解密密钥 |
| Admin Web | Vue + Tailwind CSS + TypeScript | 管理员后台，只允许管理员查看和管理实例元数据 |
| Database | SQLite / PostgreSQL | 桌面端使用本地 SQLite，服务器端使用 PostgreSQL |

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
  security-model.md
```

## 本地开发

### 桌面端

```bash
npm install
npm run dev:desktop
```

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
```

### web extension
先构建
```
npm run build:extension
```
然后：
打开 chrome://extensions
开启“开发者模式”
点击“加载已解压的扩展程序”
选择：
E:\opensource\mywork\lockpass-next\apps\browser_extension\dist
点击浏览器工具栏中的 LockPass 图标


## 服务端部署

### 本地docker部署
```
Copy-Item .env.deploy.example .env.deploy
docker compose --env-file .env.deploy up -d --build
```

访问：
用户端/API：http://localhost
管理后台：http://localhost:8081

### 生产环境部署

```
Copy-Item .env.deploy.production.example .env.deploy
```

修改对应的域名,需要在 DNS 中配置 CNAME 记录指向服务器 IP 地址
LOCKPASS_PUBLIC_URL=https://lockpass.example.com
LOCKPASS_ADMIN_URL=https://admin.lockpass.example.com

### 启动

``` 
docker compose --env-file .env.deploy up -d --build
```

生产模式会校验 HTTPS 地址，Caddy 自动申请和续期证书。