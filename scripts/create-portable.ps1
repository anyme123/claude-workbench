# Claude Workbench 便携版打包脚本
# 用法: powershell -ExecutionPolicy Bypass -File scripts\create-portable.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Claude Workbench 便携版打包工具" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$releaseDir = "src-tauri\target\release"
$portableDir = "portable-build"
$version = "4.1.3"

# 检查是否已构建
if (-not (Test-Path "$releaseDir\claude-workbench.exe")) {
    Write-Host "[错误] 找不到 claude-workbench.exe" -ForegroundColor Red
    Write-Host "请先运行: npm run tauri:build" -ForegroundColor Yellow
    exit 1
}

if (-not (Test-Path "$releaseDir\acemcp-sidecar.exe")) {
    Write-Host "[错误] 找不到 acemcp-sidecar.exe" -ForegroundColor Red
    Write-Host "请确保已将 sidecar 复制到 src-tauri\target\release" -ForegroundColor Yellow
    exit 1
}

# 清理旧的便携版
if (Test-Path $portableDir) {
    Write-Host "[清理] 删除旧的便携版目录..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $portableDir
}

# 创建目录结构
Write-Host "[创建] 便携版目录结构..." -ForegroundColor Green
New-Item -ItemType Directory -Path $portableDir | Out-Null
New-Item -ItemType Directory -Path "$portableDir\binaries" | Out-Null

# 复制主程序
Write-Host "[复制] 主程序 (11MB)..." -ForegroundColor Green
Copy-Item "$releaseDir\claude-workbench.exe" "$portableDir\claude-workbench.exe"

# 复制 sidecar
Write-Host "[复制] Acemcp sidecar (35MB)..." -ForegroundColor Green
Copy-Item "$releaseDir\acemcp-sidecar.exe" "$portableDir\binaries\acemcp-sidecar-x86_64-pc-windows-msvc.exe"

# 创建使用说明
Write-Host "[创建] README.txt..." -ForegroundColor Green
@"
Claude Workbench v$version - 便携版
========================================

使用方法:
1. 双击 claude-workbench.exe 启动应用

配置 Acemcp 项目上下文搜索（可选）:
1. 创建配置文件: %USERPROFILE%\.acemcp\settings.toml
2. 填写以下内容:
   BASE_URL = "https://your-api-endpoint.com"
   TOKEN = "your-api-token"

目录结构:
  claude-workbench.exe          - 主程序 (11MB)
  binaries\
    acemcp-sidecar-*.exe        - 语义搜索引擎 (35MB)

文档: https://github.com/anyme123/claude-workbench

"@ | Out-File -FilePath "$portableDir\README.txt" -Encoding UTF8

# 显示结果
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "[完成] 便携版已创建！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "位置: $portableDir\" -ForegroundColor Cyan
Write-Host "大小: ~46 MB" -ForegroundColor Cyan
Write-Host ""

Write-Host "包含文件:" -ForegroundColor Yellow
Get-ChildItem $portableDir | ForEach-Object { Write-Host "  - $($_.Name)" }
Write-Host ""
Get-ChildItem "$portableDir\binaries" | ForEach-Object { Write-Host "  - binaries\$($_.Name)" }
Write-Host ""

Write-Host "现在可以:" -ForegroundColor Yellow
Write-Host "1. 直接运行: $portableDir\claude-workbench.exe" -ForegroundColor White
Write-Host "2. 或打包为 ZIP 分发给用户" -ForegroundColor White
Write-Host ""
