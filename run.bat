@echo off
chcp 65001 >nul
title EasyWebTab 本地导航

echo ========================================
echo   EasyWebTab 本地导航
echo   访问地址: http://localhost:16718
echo ========================================
echo.

cd /d %~dp0

echo [1/3] 检查并安装依赖...
if not exist "node_modules" (
    echo 首次运行，正在安装依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 依赖安装失败，请确保已安装 Node.js
        pause
        exit /b 1
    )
)

echo [2/3] 检查构建文件...
if not exist "dist" (
    echo 首次运行或构建文件缺失，正在构建...
    call npm run build
    if errorlevel 1 (
        echo [错误] 构建失败
        pause
        exit /b 1
    )
)

echo [3/3] 启动服务...
echo.
echo 服务已启动，浏览器访问 http://localhost:16718
echo 按 Ctrl+C 停止服务
echo.

npm run serve
