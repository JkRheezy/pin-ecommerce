# Harness Loop 启动脚本
# 自动设置必要的环境变量并启动 Loop

# 设置控制台编码
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 从用户环境变量读取（之前已设置）
$env:ANTHROPIC_API_KEY = [Environment]::GetEnvironmentVariable("ANTHROPIC_API_KEY", "User")
$env:GITHUB_TOKEN = [Environment]::GetEnvironmentVariable("GITHUB_TOKEN", "User")
$env:ENABLE_TOOL_SEARCH = "false"

# 验证环境变量
Write-Host "✅ 环境变量已设置:" -ForegroundColor Green
Write-Host "   ANTHROPIC_API_KEY: $($env:ANTHROPIC_API_KEY.Substring(0, 15))..." -ForegroundColor Gray
Write-Host "   GITHUB_TOKEN: $($env:GITHUB_TOKEN.Substring(0, 20))..." -ForegroundColor Gray
Write-Host "   ENABLE_TOOL_SEARCH: $env:ENABLE_TOOL_SEARCH" -ForegroundColor Gray
Write-Host ""

# 启动 Loop
$duration = $args[0]
if (-not $duration) { $duration = "0.5" }

Write-Host "🚀 启动 Harness Loop (时长: $duration 小时)..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

node D:\work\study\Kimi_Agent_OpenAI_Harness\harness-cli\dist\cli.js loop --duration $duration
