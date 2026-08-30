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

if not exist node_modules (
  echo Premiere installation, patiente une minute...
  call npm install
  if errorlevel 1 (
    echo.
    echo L'installation a echoue. Verifie ta connexion internet et relance ce fichier.
    pause
    exit /b 1
  )
)

call npm start
