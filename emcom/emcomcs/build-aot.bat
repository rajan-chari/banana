@echo off
call "C:\Program Files\Microsoft Visual Studio\18\Enterprise\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
dotnet publish C:\s\projects\work\teams\working\banana\emcom\emcomcs -c Release -r win-x64
