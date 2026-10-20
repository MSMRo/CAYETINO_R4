@echo off
setlocal enabledelayedexpansion
title Grabador Automatico de Firmware - Cayetino R4 (Arduino Uno R4 WiFi)

echo =====================================================================
echo       CAYETINO R4 - ACTUALIZADOR Y FLASHER DE FIRMWARE
echo              (Arduino Uno R4 WiFi - DAC 12-bit 3.3V)
echo =====================================================================
echo.

:: 1. Definicion de rutas
set "ROOT_DIR=%~dp0"
set "BUILD_DIR=%ROOT_DIR%firmware\build"
set "SKETCH_BUILD_DIR=C:\Users\47470482\AppData\Local\arduino\sketches\D72A61E75C297AC9B8A3B0940860A270"
set "ARDUINO_CLI=C:\Users\47470482\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe"
set "BOSSAC_EXE=C:\Users\47470482\AppData\Local\Arduino15\packages\arduino\tools\bossac\1.9.1-arduino5\bossac.exe"
set "BIN_NAME=uno_r4_biomedical_player.ino.bin"
set "ELF_NAME=uno_r4_biomedical_player.ino.elf"
set "HEX_NAME=uno_r4_biomedical_player.ino.hex"
set "MAP_NAME=uno_r4_biomedical_player.ino.map"

if not exist "%BUILD_DIR%" mkdir "%BUILD_DIR%"

:: 2. Sincronizar binarios desde la carpeta temporal de Arduino IDE si existe
echo [1/3] Verificando y copiando ultimos binarios compilados...
if exist "%SKETCH_BUILD_DIR%\%BIN_NAME%" (
    echo   - Copiando %BIN_NAME% a firmware\build...
    copy /Y "%SKETCH_BUILD_DIR%\%BIN_NAME%" "%BUILD_DIR%\%BIN_NAME%" >nul
    if exist "%SKETCH_BUILD_DIR%\%ELF_NAME%" copy /Y "%SKETCH_BUILD_DIR%\%ELF_NAME%" "%BUILD_DIR%\%ELF_NAME%" >nul
    if exist "%SKETCH_BUILD_DIR%\%HEX_NAME%" copy /Y "%SKETCH_BUILD_DIR%\%HEX_NAME%" "%BUILD_DIR%\%HEX_NAME%" >nul
    if exist "%SKETCH_BUILD_DIR%\%MAP_NAME%" copy /Y "%SKETCH_BUILD_DIR%\%MAP_NAME%" "%BUILD_DIR%\%MAP_NAME%" >nul
    echo   [OK] Archivos .bin, .elf, .hex y .map sincronizados correctamente.
) else (
    echo   [INFO] No se encontro la carpeta de compilacion temporal. Usando binarios locales en firmware\build.
)

set "TARGET_BIN=%BUILD_DIR%\%BIN_NAME%"
if not exist "%TARGET_BIN%" (
    echo [ERROR] No se encontro el binario: %TARGET_BIN%
    echo Por favor compila el proyecto primero desde Arduino IDE o verifica la ruta.
    goto FIN
)

echo.
:: 3. Detectar puerto COM del Arduino Uno R4 WiFi
echo [2/3] Buscando Arduino Uno R4 WiFi conectado por USB...
set "DETECTED_PORT="

:: Metodo A: PowerShell Win32_PnPEntity / Win32_SerialPort
for /f "tokens=*" %%P in ('powershell -NoProfile -Command "Get-CimInstance Win32_SerialPort | Where-Object { $_.Description -match 'Uno R4|USB|Serial' } | Select-Object -ExpandProperty DeviceID -First 1"') do (
    set "DETECTED_PORT=%%P"
)

:: Metodo B: Fallback por arduino-cli si no se detecto
if "%DETECTED_PORT%"=="" (
    if exist "%ARDUINO_CLI%" (
        for /f "tokens=1" %%C in ('"%ARDUINO_CLI%" board list 2^>nul ^| findstr /I "unor4wifi"') do (
            set "DETECTED_PORT=%%C"
        )
    )
)

:: Metodo C: Si aun no se detecta, preguntar al usuario
if "%DETECTED_PORT%"=="" (
    echo [AVISO] No se pudo autodetectar el puerto COM.
    set /p "DETECTED_PORT=Introduce el puerto COM del Arduino Uno R4 (ej. COM26): "
)

if "%DETECTED_PORT%"=="" (
    echo [ERROR] No se especifico ningun puerto COM. Abortando.
    goto FIN
)

echo   [OK] Dispositivo localizado en el puerto: %DETECTED_PORT%
echo.

:: 4. Grabacion del Firmware
echo [3/3] Iniciando grabacion del firmware en Arduino Uno R4...
echo   NOTA: Asegurate de haber desconectado la interfaz Web (Web Serial)
echo   y de cerrar el Monitor Serie en Arduino IDE para liberar el puerto COM.
echo.

if exist "%ARDUINO_CLI%" (
    echo   Ejecutando upload via arduino-cli...
    "%ARDUINO_CLI%" upload -p %DETECTED_PORT% -b arduino:renesas_uno:unor4wifi -i "%TARGET_BIN%"
    if !errorlevel! equ 0 (
        goto EXITO
    )
    echo   [AVISO] arduino-cli reporto un fallo. Probando metodo alternativo con bossac...
)

if exist "%BOSSAC_EXE%" (
    echo   Activando modo bootloader (1200 bps touch en %DETECTED_PORT%)...
    powershell -NoProfile -Command "$port = new-object System.IO.Ports.SerialPort '%DETECTED_PORT%', 1200; $port.DtrEnable = $true; try { $port.Open(); Start-Sleep -Milliseconds 250; $port.Close(); Start-Sleep -Milliseconds 1000; } catch {}"
    
    echo   Grabando con bossac...
    "%BOSSAC_EXE%" -d --port=%DETECTED_PORT% -U -e -w "%TARGET_BIN%" -R
    if !errorlevel! equ 0 goto EXITO
)

echo.
echo =====================================================================
echo [ERROR] La grabacion no pudo completarse.
echo Causas posibles:
echo   1. El puerto %DETECTED_PORT% esta ocupado (desconecta la Web o el Monitor Serie).
echo   2. El cable USB no hace buen contacto o el puerto cambio de numero.
echo =====================================================================
goto FIN

:EXITO
echo.
echo =====================================================================
echo   [EXITO] Firmware grabado satisfactoriamente en Arduino Uno R4!
echo   - Salida DAC Pin A0 configurada a maximo 3.3V (segura para 3.3V).
echo   - Navegacion LCD y lectura de botones en Pin A2 activas.
echo =====================================================================

:FIN
echo.
pause
