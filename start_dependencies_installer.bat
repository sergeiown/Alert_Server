:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

if not exist "node_modules" (
    echo node_modules folder not found. Installing dependencies...
    npm install
    echo. & timeout /nobreak /t 2 >nul
)