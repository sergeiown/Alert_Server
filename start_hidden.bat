@echo off

set "VBSFile=%temp%\invisible.vbs"
set "SessionFile=session.tmp"

:: Зчитування PID з файлу session.tmp
for /f %%i in (%SessionFile%) do set "NodePID=%%i"

:: Завершення процесу із вказаним PID
taskkill /f /pid %NodePID% >nul 2>nul

:: Запуск нового процесу у фоновому режимі
echo CreateObject("Wscript.Shell").Run "powershell -WindowStyle Hidden -Command ""node index.js""", 0 > %VBSFile%
start /b %VBSFile%

echo Alert update server is successfully started.
timeout /t 1 /nobreak > nul

del %VBSFile%

:: Запис нового PID у файл session.tmp
for /f "tokens=2 delims=," %%i in ('tasklist /nh /fi "imagename eq node.exe" /fo csv ^| findstr /i "node.exe"') do (
    echo %%i > %SessionFile%
)