# Stop dev server, clear build cache, restart
# Run: .\scripts\fresh-dev.ps1

Write-Host "Stopping Node processes..." -ForegroundColor Yellow
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "Removing .next cache..." -ForegroundColor Yellow
if (Test-Path ".next") {
  Remove-Item -Recurse -Force ".next" -ErrorAction SilentlyContinue
  if (Test-Path ".next") {
    Write-Host "Could not fully remove .next - close Cursor/VS Code and try again" -ForegroundColor Red
    exit 1
  }
}

Write-Host "Starting dev server..." -ForegroundColor Green
npm run dev
