# Harness Loop 启动脚本
# 自动设置 UTF-8 编码，解决中文乱码问题

# ===== 编码设置（关键）=====
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

# ===== 环境变量设置 =====
$env:ANTHROPIC_API_KEY = "sk-kimi-2mZaQf6fRT3pvQegC3ypQ9uy8gRAgbY2BCnMpwjkMrr6yakzRposNZ15QJuMPAlI"
$env:ENABLE_TOOL_SEARCH = "false"
$env:GITHUB_TOKEN = $env:GITHUB_TOKEN

# ===== 启动 Loop =====
Write-Host "启动 Harness Loop..."
Write-Host "工作目录: $PWD"

# 清理旧的日志文件
Remove-Item "logs\harness.log" -Force -ErrorAction SilentlyContinue

# 启动 Loop
node D:\work\study\Kimi_Agent_OpenAI_Harness\harness-cli\dist\cli.js loop --duration 4