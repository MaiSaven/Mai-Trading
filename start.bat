@echo off
title MAI Trading Launcher
cd /d "%~dp0"

:: 1. Virtual environment pythonw (silent, no terminal)
if exist ".venv\Scripts\pythonw.exe" (
    start "" ".venv\Scripts\pythonw.exe" launcher.py
    exit /b 0
)

:: 2. System pythonw (silent, no terminal)
where pythonw >nul 2>&1
if %errorlevel% equ 0 (
    start "" pythonw launcher.py
    exit /b 0
)

:: 3. Virtual environment python (detached)
if exist ".venv\Scripts\python.exe" (
    start "" ".venv\Scripts\python.exe" launcher.py
    exit /b 0
)

:: 4. System python (detached)
where python >nul 2>&1
if %errorlevel% equ 0 (
    start "" python launcher.py
    exit /b 0
)

echo.
echo [ERROR] Python not found!
echo Please make sure Python or the project virtual environment is installed.
echo.
pause

