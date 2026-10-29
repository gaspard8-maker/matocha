@echo off
rem Eventis Bot - lancement sous Windows (double-clic ou "start-windows.bat" dans un terminal).
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Eventis Bot

where node >nul 2>nul
if errorlevel 1 goto :no_node
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 goto :old_node

if exist node_modules goto :deps_ok
echo Installation des dependances, premiere fois uniquement...
call npm ci
if errorlevel 1 goto :error
:deps_ok

if exist .env goto :env_ok
copy .env.example .env >nul
echo.
echo Un fichier .env vient d'etre cree. Le Bloc-notes va s'ouvrir :
echo remplis le token et les identifiants, enregistre, ferme le Bloc-notes,
echo puis relance start-windows.bat.
echo.
notepad .env
pause
exit /b 0
:env_ok

call npm run check-config
if errorlevel 1 goto :error
call npm run register-commands
if errorlevel 1 goto :error
call npm run build
if errorlevel 1 goto :error

echo.
echo Eventis Bot demarre. Laisse cette fenetre ouverte.
echo Pour l'arreter : Ctrl+C, ou ferme la fenetre.
echo.
call npm start
pause
exit /b 0

:no_node
echo Node.js n'est pas installe.
echo Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
pause
exit /b 1

:old_node
echo Node.js 22.13 ou plus recent est necessaire.
echo Installe la version LTS depuis https://nodejs.org puis relance ce fichier.
pause
exit /b 1

:error
echo.
echo Une erreur est survenue : lis le message ci-dessus.
echo Probleme de .env ? Ouvre-le avec : notepad .env
pause
exit /b 1
