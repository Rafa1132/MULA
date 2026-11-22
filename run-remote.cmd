@echo off
rem Windows launcher: run the frontend against the shared Mula backend (scripts\run-remote.mjs).
rem Double-click it, or type run-remote.cmd in PowerShell or cmd. Options: --no-open.
where node >nul 2>nul
if errorlevel 1 (
  echo run-remote: Node.js is not installed. Install Node.js 20 or newer from https://nodejs.org
  pause
  exit /b 1
)
node "%~dp0scripts\run-remote.mjs" %*
if errorlevel 1 pause
