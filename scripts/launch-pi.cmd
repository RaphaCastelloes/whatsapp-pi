@echo off
setlocal
chcp 65001 >nul
set "LANG=pt_BR.UTF-8"
set "LC_ALL=pt_BR.UTF-8"

set "ENTRYPOINT=%~dp0..\whatsapp-pi.ts"
pi -e "%ENTRYPOINT%" %*
exit /b %errorlevel%
