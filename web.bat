@echo off
setlocal enabledelayedexpansion
title MultiSig Wallet - Local Coordinator

echo ============================================
echo   MultiSig Wallet - Local Web Coordinator
echo ============================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] Node.js tidak ditemukan di komputer ini.
    echo.
    echo     Web app ini butuh Node.js ^(LTS^) untuk jalan.
    echo     Membuka halaman download Node.js di browser...
    start https://nodejs.org/en/download
    echo.
    echo     Setelah selesai install Node.js, jalankan ulang web.bat ini.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node --version') do set NODE_VERSION=%%v
echo [OK] Node.js terdeteksi: %NODE_VERSION%
echo.

cd /d "%~dp0web"

if not exist node_modules (
    echo [*] Menginstall dependencies ^(sekali saja^)... ini bisa makan waktu beberapa menit.
    call npm install
    if %errorlevel% neq 0 (
        echo [!] npm install gagal. Cek koneksi internet lalu coba lagi.
        pause
        exit /b 1
    )
) else (
    echo [OK] Dependencies sudah terinstall.
)

echo.
echo [*] Menjalankan server lokal di http://localhost:5173 ...
echo     Browser akan terbuka otomatis. Tutup jendela ini untuk stop server.
echo.

call npm run dev

pause
