# Easy Web Tab - PM2 开机自启动脚本 (Windows)
# 此脚本用于 Windows 开机自动启动 PM2 进程

# 获取脚本所在目录
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# 切换到项目目录
Set-Location $ScriptDir

# 恢复 PM2 保存的进程列表
pm2 resurrect
