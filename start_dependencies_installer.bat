:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

if not exist "node_modules" (
    echo Installing Node.js dependencies...
    npm install

    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies. Please check the npm setup and try again.
        pause
        exit /b 1
    )
) else (
    echo Dependencies are already installed.
)