@echo off
title Quiz Media Tool - Startup Script

echo =========================================
echo  Launching Quiz Media Tool...
echo =========================================

:: 0. Обновление yt-dlp
echo [0/2] Updating yt-dlp...
python -m pip install -U yt-dlp --quiet

:: 1. Запуск бэкенда FastAPI в отдельном окне
echo [1/2] Starting Backend (FastAPI)...
start "Backend - FastAPI" cmd /k "cd backend && python -m uvicorn app.main:app --reload"

:: 2. Запуск фронтенда Vite в текущем или новом окне
echo [2/2] Starting Frontend (Vite)...
start "Frontend - Vite" cmd /k "cd frontend && npm run dev"

echo =========================================
echo  Both servers are starting up! 
echo  Frontend: http://localhost:5173
echo  Backend:  http://127.0.0.1:8000
echo =========================================
pause