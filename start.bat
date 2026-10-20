@echo off
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"

echo Starting Auto Dispatcher...

python run.py 8080

if errorlevel 1 (
    echo.
    echo Trying direct python path...
    C:\Python314\python.exe run.py 8080
)

pause
