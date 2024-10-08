:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title Dependencies installation

for /f "delims=" %%i in ('where npm') do set "npmPath=%%i"

if not defined npmPath (
    if exist "%ProgramFiles%\nodejs\npm.cmd" (
        set "npmPath=%ProgramFiles%\nodejs\npm.cmd"
    ) else if exist "%AppData%\npm\npm.cmd" (
        set "npmPath=%AppData%\npm\npm.cmd"
    ) else (
        echo Error: npm is not found.
        echo. & echo Please run installation again.
        echo.
        pause & exit /b 1
    )
)

if not exist "node_modules" (
    echo Installing Node.js dependencies...
    "%npmPath%" install

    if %errorlevel% neq 0 (
        echo Error: Failed to install dependencies.
        echo. & echo The repository may be temporarily unavailable.
        echo. & echo Please run installation again.
        echo.
        pause & exit /b 1
    )
) else (
    echo Dependencies are already installed.
)
