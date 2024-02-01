@echo off
set "VBSFile=%temp%\invisible.vbs"

echo CreateObject("Wscript.Shell").Run "powershell -WindowStyle Hidden -Command ""node index.js""", 0 > %VBSFile%
start /b %VBSFile%

timeout /t 1 /nobreak > nul

del %VBSFile%