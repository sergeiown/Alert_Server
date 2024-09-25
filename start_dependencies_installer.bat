:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title Dependencies installation

for /f "delims=" %%i in ('where npm') do set "npmPath=%%i"

if not defined npmPath (
    echo Error: npm is not installed or not found in PATH.
    pause & exit /b 1
)

if not exist "node_modules" (
    echo Installing Node.js dependencies...
    "%npmPath%" install

    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies. Please check the npm setup and try again.
        pause & exit /b 1
    )
) else (
    echo Dependencies are already installed.
)
