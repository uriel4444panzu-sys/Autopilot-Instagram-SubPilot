@echo off
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js n'est pas installe sur cet ordinateur.
  echo Va sur https://nodejs.org, installe la version "LTS", puis relance ce fichier.
  echo.
  pause
  exit /b 1
)

echo Demarrage de SubPilot Control Room...
echo Le navigateur va s'ouvrir automatiquement. Laisse cette fenetre ouverte.
echo.
node server.js
pause
