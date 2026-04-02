# Harness Loop 启动脚本 (无 Profile 模式)
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
chcp 65001 | Out-Null

$env:ANTHROPIC_API_KEY = "sk-kimi-2mZaQf6fRT3pvQegC3ypQ9uy8gRAgbY2BCnMpwjkMrr6yakzRposNZ15QJuMPAlI"
$env:ENABLE_TOOL_SEARCH = "false"

Write-Host "启动 Harness Loop..."
cd D:	est\my-project
Remove-Item "logs\harness.log" -Force -ErrorAction SilentlyContinue
node D:	est\my-project\harness-cli\dist\cli.js loop --duration 1
