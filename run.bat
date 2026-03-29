@echo off
title EasyWebTab Local Server

echo ========================================
echo   EasyWebTab Local Server
echo   Access: http://localhost:16718
echo ========================================
echo.

cd /d %~dp0
echo Working directory: %CD%
echo.

:: Set Node.js path - CHANGE THIS TO YOUR NODE.JS LOCATION
set PATH=%PATH%;E:\installSoftware\nodejs\

:: Check if node is available
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please check the PATH in the script.
    pause
    exit /b 1
)

echo Node.js: 
node --version

:: Skip npm version check - it can hang on first run
echo npm: (skipping check, assuming available)
echo.

:: Check dependencies
echo [1/3] Checking dependencies...
if not exist "node_modules" (
    echo Installing...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo Done
) else (
    echo Already installed
)

:: Check build
echo.
echo [2/3] Checking build...
if not exist "dist" (
    echo Building...
    call npm run build
    if %errorlevel% neq 0 (
        echo [ERROR] Build failed
        pause
        exit /b 1
    )
    echo Done
) else (
    echo Already built
)

:: Start server
echo.
echo [3/3] Starting server...
echo ========================================
echo   Server running!
echo   Open: http://localhost:16718
echo   Press Ctrl+C to stop
echo ========================================
echo.

npm run serve

echo.
echo Server stopped.
pause
