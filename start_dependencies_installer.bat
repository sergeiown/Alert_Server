@echo off

if not exist "node_modules" (
    echo node_modules folder not found. Installing dependencies...
    npm install
    timeout /nobreak /t 2 >nul
)