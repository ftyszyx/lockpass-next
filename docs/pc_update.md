# PC 端应用内自动更新方案

本文档描述 LockPass 桌面端在 Windows 上的应用内自动更新方案。当前先以 Tauri 2 updater 插件为基础实现 Windows 自动更新，后续再扩展 macOS 和 Linux。

## 目标

- 用户可以在桌面端内检查更新、下载更新并安装。
- 更新包必须签名校验，避免被替换成非官方安装包。
- Windows 上优先使用 NSIS 安装包，安装过程使用 `passive` 模式，让用户看到进度但尽量减少交互。
- 第一阶段使用静态 `latest.json` 发布更新；后续再切换到服务端动态更新接口，支持灰度、渠道和回滚策略。

## 技术选型

使用 Tauri 2 官方 updater 插件：

- Rust 插件：`tauri-plugin-updater`
- 前端插件：`@tauri-apps/plugin-updater`
- 重启插件：`@tauri-apps/plugin-process`

Tauri updater 支持静态 JSON 文件和动态更新服务器。更新签名不能关闭，客户端会用写入 `tauri.conf.json5` 的公钥验证更新包签名。

## 发布形态

第一阶段使用静态发布：

```text
https://updates.lockpass.example.com/desktop/latest.json
https://updates.lockpass.example.com/desktop/windows/LockPass_0.1.1_x64-setup.exe
https://updates.lockpass.example.com/desktop/windows/LockPass_0.1.1_x64-setup.exe.sig
```

后续正式域名确定后，将 `updates.lockpass.example.com` 替换为真实更新域名。生产环境必须使用 HTTPS。

## 更新配置

`apps/desktop/src-tauri/tauri.conf.json5` 已启用 updater 配置：

```json
{
  "bundle": {
    "active": true,
    "targets": "nsis",
    "createUpdaterArtifacts": true,
  
  },
  "plugins": {
    "updater": {
      "pubkey": "当前 updater 公钥内容",
      "endpoints": [
        "https://updates.lockpass.example.com/desktop/latest.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

说明：

- `createUpdaterArtifacts: true` 会让 Tauri 在打包时生成更新包签名文件。
- `pubkey` 必须填公钥内容，不能填公钥文件路径。
- `endpoints` 可以先指向静态 `latest.json`，后续也可以换成动态接口。
- Windows 的 `installMode` 使用 `passive`，更新安装时会出现带进度条的小窗口。

## 签名密钥

生成更新签名密钥：

```powershell
npm exec tauri signer generate -- -w "$env:USERPROFILE\.tauri\lockpass.key"
```

生成后会得到：

- 私钥：用于构建时签名，必须严格保密。
- 公钥：写入 `tauri.conf.json5` 的 `plugins.updater.pubkey`。

注意：

- 私钥不能提交到 Git。
- 私钥丢失后，已安装用户无法继续信任后续更新包。
- CI/CD 中应把私钥放入 secret，不放入 `.env` 文件。

## 构建更新包

推荐使用发布脚本统一处理签名环境变量、Tauri 打包、`latest.json` 生成和 OSS 上传。先复制示例配置：

```powershell
Copy-Item tools/pc_release.env.example tools/pc_release.env
```

编辑 `tools/pc_release.env` 后，本地打包并生成 `latest.json`：

```powershell
python tools/pc_release.py
```

打包并上传到 OSS：

```powershell
python tools/pc_release.py --upload
```

只预览上传目标，不实际上传：

```powershell
python tools/pc_release.py --skip-build --upload --dry-run
```

如果上传时提示缺少 `oss2`，先安装脚本依赖：

```powershell
python -m pip install -r tools/requirements.txt
```

Windows NSIS 产物会复制到：

```text
tools/dist/pc_release/
```

Tauri 原始产物会出现在：

```text
apps/desktop/src-tauri/target/release/bundle/nsis/
```

启用 `createUpdaterArtifacts: true` 后，Windows 会生成 NSIS 安装包和对应的 `.sig` 文件，例如：

```text
LockPass_0.1.1_x64-setup.exe
LockPass_0.1.1_x64-setup.exe.sig
```

第一阶段推荐使用 NSIS 的 `.exe` 作为更新包。

## 静态 latest.json

静态更新清单示例：

```json
{
  "version": "0.1.1",
  "notes": "修复已知问题并优化同步体验。",
  "pub_date": "2026-06-12T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "这里粘贴 LockPass_0.1.1_x64-setup.exe.sig 的文件内容",
      "url": "https://updates.lockpass.example.com/desktop/windows/LockPass_0.1.1_x64-setup.exe"
    }
  }
}
```

注意：

- `version` 必须是 SemVer，例如 `0.1.1`。
- `signature` 必须是 `.sig` 文件内容，不是 `.sig` 文件 URL。
- `platforms` 的 key 使用 `OS-ARCH`，Windows x64 是 `windows-x86_64`。
- Tauri 会先校验整个 JSON，再比较版本号，所以 JSON 中出现的平台配置必须完整有效。

## 前端交互

建议在桌面端设置中增加“软件更新”页：

- 显示当前版本。
- 显示“检查更新”按钮。
- 检查到新版本后展示版本号、发布日期、更新说明。
- 用户点击“立即更新”后显示下载和安装进度。
- 安装完成后提示重启，或自动调用 `relaunch()` 重启。
- 更新失败时显示可读错误，并提供“前往下载页”的备用入口。

基础前端调用：

```ts
import { relaunch } from '@tauri-apps/plugin-process'
import { check } from '@tauri-apps/plugin-updater'

const update = await check()

if (update) {
  await update.downloadAndInstall((event) => {
    switch (event.event) {
      case 'Started':
        break
      case 'Progress':
        break
      case 'Finished':
        break
    }
  })

  await relaunch()
}
```

因为项目要求前端支持多语言，更新页所有用户可见文案必须放入桌面端 i18n 语言包。

## 发布流程

1. 更新版本号：
   - `apps/desktop/src-tauri/tauri.conf.json5`
   - `apps/desktop/src-tauri/Cargo.toml`
   - `apps/desktop/package.json`

2. 写更新说明。

3. 设置签名环境变量。

4. 执行打包：

```powershell
npm run -w @lockpass/desktop tauri:build
```

5. 上传 NSIS 安装包和 `.sig` 文件到更新文件服务器。

6. 生成或更新 `latest.json`。

7. 用旧版本客户端执行一次完整更新测试：
   - 检查更新。
   - 下载更新。
   - 安装更新。
   - 重启后确认版本号变更。
   - 确认本地数据库和设置仍可读取。

## 后续动态更新接口

静态 `latest.json` 跑通后，可以改为服务端动态接口：

```text
GET /desktop/updates/{{target}}/{{arch}}/{{current_version}}
```

无更新时返回：

```text
204 No Content
```

有更新时返回：

```json
{
  "version": "0.1.1",
  "pub_date": "2026-06-12T00:00:00Z",
  "url": "https://updates.lockpass.example.com/desktop/windows/LockPass_0.1.1_x64-setup.exe",
  "signature": "这里是 .sig 文件内容",
  "notes": "修复已知问题并优化同步体验。"
}
```

动态接口后续可支持：

- stable / beta 渠道。
- 按版本灰度发布。
- 按平台和架构返回不同安装包。
- 强制安全更新。
- 版本回滚策略。

## 风险和注意事项

- 更新签名私钥是最高优先级发布资产，必须备份并限制访问。
- Windows 更新安装前，Tauri 会因为安装器限制自动退出应用；如果需要保存状态，应在更新前主动保存。
- `quiet` 安装模式没有进度反馈，且无法自行请求管理员权限，不建议使用。
- 改 `productName`、`identifier` 或 MSI `upgradeCode` 可能影响 Windows 识别升级关系；正式发布前要固定。
- 更新服务必须支持 HTTPS，并保持安装包 URL 长期可访问。
- 更新前要确保当前同步、备份、导入等长任务不在执行，避免用户误以为数据丢失。

## 参考资料

- Tauri 2 Updater 官方文档：https://v2.tauri.app/plugin/updater/
- Tauri 配置文档：https://v2.tauri.app/reference/config/
