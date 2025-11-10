@echo off
REM 创建 Claude Workbench 便携版
REM 用法: scripts\create-portable.bat

echo ========================================
echo Claude Workbench 便携版打包工具
echo ========================================
echo.

set RELEASE_DIR=src-tauri\target\release
set PORTABLE_DIR=portable-build
set VERSION=4.1.3

REM 检查是否已构建
if not exist "%RELEASE_DIR%\claude-workbench.exe" (
    echo [错误] 找不到 claude-workbench.exe
    echo 请先运行: npm run tauri:build
    exit /b 1
)

if not exist "%RELEASE_DIR%\acemcp-sidecar.exe" (
    echo [错误] 找不到 acemcp-sidecar.exe
    echo 请确保已将 sidecar 复制到 src-tauri\target\release\
    exit /b 1
)

REM 清理旧的便携版
if exist "%PORTABLE_DIR%" (
    echo [清理] 删除旧的便携版目录...
    rmdir /s /q "%PORTABLE_DIR%"
)

REM 创建目录结构
echo [创建] 便携版目录结构...
mkdir "%PORTABLE_DIR%"
mkdir "%PORTABLE_DIR%\binaries"

REM 复制主程序
echo [复制] 主程序 (11MB)...
copy "%RELEASE_DIR%\claude-workbench.exe" "%PORTABLE_DIR%\claude-workbench.exe" >nul

REM 复制 sidecar
echo [复制] Acemcp sidecar (35MB)...
copy "%RELEASE_DIR%\acemcp-sidecar.exe" "%PORTABLE_DIR%\binaries\acemcp-sidecar-x86_64-pc-windows-msvc.exe" >nul

REM 创建使用说明
echo [创建] README.txt...
(
echo Claude Workbench v%VERSION% - 便携版
echo ========================================
echo.
echo 使用方法:
echo 1. 双击 claude-workbench.exe 启动应用
echo.
echo 配置 Acemcp 项目上下文搜索（可选）:
echo 1. 创建配置文件: %%USERPROFILE%%\.acemcp\settings.toml
echo 2. 填写以下内容:
echo    BASE_URL = "https://your-api-endpoint.com"
echo    TOKEN = "your-api-token"
echo.
echo 目录结构:
echo   claude-workbench.exe          - 主程序 ^(11MB^)
echo   binaries\
echo     acemcp-sidecar-*.exe        - 语义搜索引擎 ^(35MB^)
echo.
echo 文档: https://github.com/anyme123/claude-workbench
) > "%PORTABLE_DIR%\README.txt"

REM 显示结果
echo.
echo ========================================
echo [完成] 便携版已创建！
echo ========================================
echo.
echo 位置: %PORTABLE_DIR%\
echo 大小: ~46 MB
echo.
echo 包含文件:
dir /b "%PORTABLE_DIR%"
echo.
dir /b "%PORTABLE_DIR%\binaries"
echo.
echo 现在可以:
echo 1. 直接运行: %PORTABLE_DIR%\claude-workbench.exe
echo 2. 或打包为 ZIP: 7z a claude-workbench-portable-v%VERSION%.zip %PORTABLE_DIR%\*
echo.
