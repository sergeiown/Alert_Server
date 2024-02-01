@echo off
set "VBSFile=%temp%\invisible.vbs"

echo CreateObject("Wscript.Shell").Run "powershell -WindowStyle Hidden -Command ""node index.js""", 0 > %VBSFile%
start /b %VBSFile%

echo Alert update server is successfully started.
timeout /t 1 /nobreak > nul

del %VBSFile%