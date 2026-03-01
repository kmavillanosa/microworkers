@echo off
setlocal

cd /d "%~dp0"

if not exist ".reels-venv\Scripts\python.exe" (
	echo [ERROR] Virtual environment not found at .reels-venv
	echo Run setup first:
	echo   python -m venv .reels-venv
	echo   .reels-venv\Scripts\python -m pip install -r requirements.txt
	pause
	exit /b 1
)

echo.
set /p SCRIPT_PATH=Script file path (default: scripts\example-script.txt): 
if "%SCRIPT_PATH: =%"=="" set "SCRIPT_PATH=scripts\example-script.txt"

if not exist "%SCRIPT_PATH%" (
	echo [ERROR] Script file not found: %SCRIPT_PATH%
	pause
	exit /b 1
)

echo.
set /p TITLE=Optional title (press Enter to skip): 
if "%TITLE: =%"=="" set "TITLE="

echo.
echo Running generator...
if "%TITLE%"=="" (
	call .reels-venv\Scripts\python reels_generator.py --script "%SCRIPT_PATH%" --bg-dir assets\game-clips --size 720x1280 --fps 24 --render-preset ultrafast --voice-engine pyttsx3 --voice-rate 180
) else (
	call .reels-venv\Scripts\python reels_generator.py --script "%SCRIPT_PATH%" --bg-dir assets\game-clips --size 720x1280 --fps 24 --render-preset ultrafast --voice-engine pyttsx3 --voice-rate 180 --title "%TITLE%"
)

echo.
echo Done. Check the output folder for your reel.
pause
