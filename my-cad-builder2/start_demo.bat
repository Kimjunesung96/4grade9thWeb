@echo off
rem ============================================================
rem        ?   ?         ?   ?      ?    ? ?         a          ?? .
rem   -     ? : npm run dev                          (http://localhost:5173)
rem   -  ?   : uvicorn main:app --reload --port 8000 (src\backend          )
rem  stress_analysis.py    main.py     ?             ?                 ?  ? .
rem ============================================================
cd /d "%~dp0"

if not exist "src\backend\main.py" goto nomain

rem node_modules                1?   ?
if exist "node_modules" goto have_nm
echo node_modules         npm install              ?? . o            ?  ? .
call npm install
if errorlevel 1 goto npmfail
:have_nm

start "Frontend (npm run dev)" /D "%~dp0" cmd /k npm run dev
start "Backend (uvicorn :8000)" /D "%~dp0src\backend" cmd /k python -m uvicorn main:app --reload --port 8000

echo.
echo    a 2        ?  ? .  y              a           .
echo  -     ? : http://localhost:5173
echo  -  ?   : http://localhost:8000/docs
timeout /t 5 >nul
exit /b 0

:nomain
echo [    ] src\backend\main.py    a           ? .                 ?   ?    ¥ì   .
pause
exit /b 1

:npmfail
echo [    ] npm install         ?  ? . Node.js      ? ?   ?    ?   ?   .
pause
exit /b 1