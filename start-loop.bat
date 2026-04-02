@echo off
chcp 65001 >nul
echo 启动 Harness Loop...

set ANTHROPIC_API_KEY=sk-kimi-2mZaQf6fRT3pvQegC3ypQ9uy8gRAgbY2BCnMpwjkMrr6yakzRposNZ15QJuMPAlI
set ENABLE_TOOL_SEARCH=false

cd /d D:\test\my-project
del /f logs\harness.log 2>nul

node D:\work\study\Kimi_Agent_OpenAI_Harness\harness-cli\dist\cli.js loop --duration 1
