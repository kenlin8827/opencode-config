# Run all tests sequentially
# Requires LLM_ROUTER_BASE_URL and LLM_ROUTER_API_KEY in system environment.

Set-Location "$PSScriptRoot\.."

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 1: orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-orchestrator.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 2: plan orchestrator (custom prompt)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-plan.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 3: subagent via orchestrator dispatch" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-subagent.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test 4: default build agent (baseline)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\test-default.ps1"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All tests complete." -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
