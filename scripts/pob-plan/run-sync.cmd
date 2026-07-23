@echo off
REM Wrapper for the Windows Scheduled Task (RepoOpsTracker-PoBPlanSync).
REM Exists only so schtasks' /tr never has to embed two space-containing,
REM individually-quoted paths (node.exe under "Program Files" + this repo) in
REM one argument, which PowerShell/schtasks quoting mangles.
"C:\Program Files\nodejs\node.exe" "%~dp0sync.mjs"
