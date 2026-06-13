# 一些工具脚本


## pc_release.py
发布脚本，用于打包桌面端更新包并上传到 OSS。

```powershell
Copy-Item tools/pc_release.env.example tools/pc_release.env
python tools/pc_release.py --upload
```