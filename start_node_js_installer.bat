:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off

:: Перевірка наявності Node.js, завантаження та встановлення за необхідності
where node > nul 2>nul

if %ERRORLEVEL% neq 0 (
    
    winget install OpenJS.NodeJS
    
    echo. & timeout /nobreak /t 2 >nul

) else (
    echo Node.js is present in the system.

    call start_alertserver_hidden.bat
)
