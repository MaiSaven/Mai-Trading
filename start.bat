@echo off
title MAI Trading Launcher
cd /d "%~dp0"
python launcher.py
if errorlevel 1 (
    echo.
    echo [ERROR] Failed to start MAI Trading Launcher.
    echo Please make sure Python and required packages are installed.
    pause
)
