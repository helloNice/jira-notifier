@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "INPUT_VERSION=%~1"

if not "%~2"=="" (
  echo Usage: %~nx0 [version]
  echo Example: %~nx0 1.2.10
  exit /b 1
)

if defined INPUT_VERSION (
  echo Updating package version to %INPUT_VERSION%...
  node -e "const fs=require('fs'); const version=process.argv[1]; if(!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)){console.error('Version must be 3 or 4 dot-separated numbers, for example 1.2.10'); process.exit(1);} const regex=/(\x22version\x22\s*:\s*\x22)[^\x22]+(\x22)/g; function update(path,limit){ if(!fs.existsSync(path)) return; let text=fs.readFileSync(path,'utf8'); let count=0; text=text.replace(regex,(match,a,b)=>{ count+=1; return count<=limit ? a+version+b : match; }); if(count===0){console.error('Cannot find version field in '+path); process.exit(1);} fs.writeFileSync(path,text,'utf8'); } update('package.json',1); update('package-lock.json',2);" "%INPUT_VERSION%"
  if errorlevel 1 exit /b 1
)

echo [1/3] Type checking...
call npm run compile
if errorlevel 1 exit /b 1

echo [2/3] Packaging Chrome...
call npm run zip -- -b chrome
if errorlevel 1 exit /b 1

echo [3/3] Packaging Edge...
call npm run zip -- -b edge
if errorlevel 1 exit /b 1

rem Firefox packaging is disabled because the current Firefox build did not pass validation.
rem echo [4/4] Packaging Firefox...
rem call npm run zip -- -b firefox
rem if errorlevel 1 exit /b 1

echo Done. Check .output for the zip packages.
exit /b 0
