# Easy Web Tab - PM2 开机自启动脚本 (PowerShell)
# 用于任务计划程序，开机时自动启动 PM2 服务

# 切换到项目目录
Set-Location -Path "D:\IDEA\easyWebTab"

# 检查并启动 PM2 守护进程
$pm2Exists = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Exists) {
    Write-Host "PM2 未安装，正在安装..."
    npm install -g pm2
}

# 恢复保存的 PM2 进程列表
pm2 resurrect
