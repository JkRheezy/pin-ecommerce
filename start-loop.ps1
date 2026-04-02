# Harness Loop 启动脚本
# 使用前请确保设置了正确的环境变量

# 设置环境变量（请替换为你的实际 API Key）
$env:KIMI_API_KEY = "sk-kimi-你的API密钥"

# 验证环境变量
if (-not $env:KIMI_API_KEY -or $env:KIMI_API_KEY -eq "sk-kimi-你的API密钥") {
    Write-Host "⚠️  警告: 请修改脚本中的 KIMI_API_KEY 为你的实际 API 密钥" -ForegroundColor Yellow
    Write-Host "    可以从 https://platform.moonshot.cn 获取" -ForegroundColor Gray
    exit 1
}

# 创建日志目录
if (!(Test-Path "logs")) {
    New-Item -ItemType Directory -Path "logs" | Out-Null
}

# 启动 Loop
Write-Host "🚀 启动 Harness Loop (4小时)..." -ForegroundColor Green
Write-Host "📁 工作目录: $(Get-Location)" -ForegroundColor Gray
Write-Host "📊 日志文件: logs/harness.log" -ForegroundColor Gray
Write-Host ""

& node D:\work\study\Kimi_Agent_OpenAI_Harness\harness-cli\dist\cli.js loop --duration 4

Write-Host ""
Write-Host "🏁 Loop 已停止" -ForegroundColor Yellow
