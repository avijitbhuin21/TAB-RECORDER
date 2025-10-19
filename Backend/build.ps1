param(
    [switch]$SkipChecks
)

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Recording Server - Build Script" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

$ErrorActionPreference = "Stop"

function Test-Command {
    param($Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

if (-not $SkipChecks) {
    Write-Host "Checking prerequisites..." -ForegroundColor Yellow
    
    if (-not (Test-Command "go")) {
        Write-Host "ERROR: Go is not installed!" -ForegroundColor Red
        Write-Host "Install Go using: winget install GoLang.Go" -ForegroundColor Yellow
        exit 1
    }
    
    $goVersion = go version
    Write-Host "✓ Go installed: $goVersion" -ForegroundColor Green
    
    $gccFound = $false
    if (Test-Command "gcc") {
        $gccFound = $true
        $gccVersion = gcc --version | Select-Object -First 1
        Write-Host "✓ GCC installed: $gccVersion" -ForegroundColor Green
    } elseif (Test-Path "C:\msys64\ucrt64\bin\gcc.exe") {
        Write-Host "✓ GCC found in MSYS2 (will be added to PATH)" -ForegroundColor Green
        $env:PATH += ";C:\msys64\ucrt64\bin"
        $gccFound = $true
    } elseif (Test-Path "C:\msys64\mingw64\bin\gcc.exe") {
        Write-Host "✓ GCC found in MSYS2 (will be added to PATH)" -ForegroundColor Green
        $env:PATH += ";C:\msys64\mingw64\bin"
        $gccFound = $true
    }
    
    if (-not $gccFound) {
        Write-Host "`nERROR: GCC (MinGW) is not installed!" -ForegroundColor Red
        Write-Host "The webview package requires CGO and a C compiler." -ForegroundColor Yellow
        Write-Host "`nTo install MinGW-w64:" -ForegroundColor Cyan
        Write-Host "1. Download from: https://www.mingw-w64.org/downloads/" -ForegroundColor White
        Write-Host "2. Or use chocolatey: choco install mingw" -ForegroundColor White
        Write-Host "3. Or download MSYS2: https://www.msys2.org/" -ForegroundColor White
        Write-Host "`nAfter installation, restart your terminal and run this script again.`n" -ForegroundColor Yellow
        exit 1
    }
    
    Write-Host "`nChecking WebView2 Runtime..." -ForegroundColor Yellow
    $webview2Path = "C:\Program Files (x86)\Microsoft\EdgeWebView2"
    if (-not (Test-Path $webview2Path)) {
        Write-Host "WARNING: WebView2 Runtime may not be installed!" -ForegroundColor Yellow
        Write-Host "Install it using: winget install Microsoft.EdgeWebView2Runtime" -ForegroundColor Cyan
        Write-Host "The application may not run without it.`n" -ForegroundColor Yellow
    } else {
        Write-Host "✓ WebView2 Runtime detected" -ForegroundColor Green
    }
}

Write-Host "`nCreating dist directory..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path "dist" | Out-Null

Write-Host "`nInstalling/updating Go dependencies..." -ForegroundColor Cyan
go mod tidy
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to resolve dependencies" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Dependencies resolved" -ForegroundColor Green

Write-Host "`nInstalling goversioninfo tool..." -ForegroundColor Cyan
go install github.com/josephspurrier/goversioninfo/cmd/goversioninfo@latest
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install goversioninfo" -ForegroundColor Red
    exit 1
}
Write-Host "✓ goversioninfo installed" -ForegroundColor Green

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Generating Windows Resources..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

if (Test-Path "resource.syso") {
    Remove-Item -Force resource.syso
}

goversioninfo -64
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to generate resource file" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Resource file generated (resource.syso)" -ForegroundColor Green

Write-Host "`n================================" -ForegroundColor Cyan
Write-Host "Building for Windows (AMD64)..." -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan

$env:CGO_ENABLED = "1"
$env:GOOS = "windows"
$env:GOARCH = "amd64"

go build -ldflags="-s -w -H windowsgui" -o "dist/recorder-windows-amd64.exe"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✓ Windows build successful with custom icon!" -ForegroundColor Green
    if (Test-Path "resource.syso") {
        Remove-Item -Force resource.syso
        Write-Host "✓ Cleaned up resource file" -ForegroundColor Green
    }
} else {
    Write-Host "✗ Windows build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "`n================================" -ForegroundColor Green
Write-Host "Build Complete!" -ForegroundColor Green
Write-Host "================================`n" -ForegroundColor Green

Write-Host "Build artifacts:" -ForegroundColor Cyan
if (Test-Path "dist") {
    Get-ChildItem dist/* | ForEach-Object {
        $size = [math]::Round($_.Length / 1MB, 2)
        Write-Host "  - $($_.Name) ($size MB)" -ForegroundColor White
    }
}

Write-Host "`nTo run the application:" -ForegroundColor Cyan
Write-Host "  .\dist\recorder-windows-amd64.exe`n" -ForegroundColor White
