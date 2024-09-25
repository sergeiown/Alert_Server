:: Copyright (c) 2024 Serhii I. Myshko
:: https://github.com/sergeiown/Alert_Server/blob/main/LICENSE

@echo off
title Alert Server Shut down

taskkill /f /im node.exe >nul 2>nul

echo Alert Server is stopped.
pause