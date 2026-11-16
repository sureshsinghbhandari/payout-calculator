@echo off
rem Deploys the current commit to Vercel PRODUCTION (https://payout-calculator-steel.vercel.app).
rem Double-click it, or run it from any folder. It asks before deploying.
rem Vercel only is touched; Netlify and Cloudflare are not. DNS is never changed.

cd /d "%~dp0.."

echo.
echo Branch and commit about to go live:
git rev-parse --abbrev-ref HEAD
git log --oneline -1
echo.

git status --porcelain > "%TEMP%\deploy-dirty.txt"
for %%F in ("%TEMP%\deploy-dirty.txt") do if %%~zF GTR 0 (
  echo STOPPED: there are uncommitted changes. Commit them first, then run this again.
  echo.
  pause
  exit /b 1
)

set /p CONFIRM=Deploy this commit to PRODUCTION? Type yes to continue:
if /i not "%CONFIRM%"=="yes" (
  echo Cancelled. Nothing was deployed.
  pause
  exit /b 0
)

call npm run deploy:vercel

echo.
echo ---- Public health check (the real result; the script's own check can fail on Vercel's login page) ----
curl -s -m 30 https://payout-calculator-steel.vercel.app/api/health
echo.
echo.
echo The line above should show "status":"ok" and the commit you just deployed.
echo.
pause
