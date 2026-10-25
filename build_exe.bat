@echo off
title Build MAI Trading Desktop App (.exe)
cd /d "%~dp0"

echo ========================================================
echo   Building MAI Trading into a Standalone Windows App
echo ========================================================
echo.

echo 1. Checking PyInstaller...
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing pyinstaller...
    pip install pyinstaller
)

echo.
echo 2. Compiling launcher.py into MAI-Trading.exe...
pyinstaller --noconfirm --onedir --windowed --name "MAI-Trading" --clean launcher.py

if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo.
echo ========================================================
echo   Build Complete!
echo   Executable is located at: dist\MAI-Trading\MAI-Trading.exe
echo ========================================================
pause
