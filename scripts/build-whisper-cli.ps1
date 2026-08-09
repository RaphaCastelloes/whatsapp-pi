$ErrorActionPreference = 'Stop'

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$WhisperDir = if ($env:WHISPER_DIR) { $env:WHISPER_DIR } else { Join-Path $RootDir 'vendor/whisper.cpp' }

if (-not (Get-Command cmake -ErrorAction SilentlyContinue)) {
    throw 'cmake is required to build whisper.cpp'
}

if (-not (Test-Path (Join-Path $WhisperDir '.git'))) {
    New-Item -ItemType Directory -Force -Path (Split-Path $WhisperDir) | Out-Null
    git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git $WhisperDir
}

cmake -S $WhisperDir -B (Join-Path $WhisperDir 'build') `
    -DWHISPER_BUILD_TESTS=OFF `
    -DWHISPER_BUILD_EXAMPLES=ON `
    -DCMAKE_BUILD_TYPE=Release
cmake --build (Join-Path $WhisperDir 'build') --config Release --target whisper-cli

Write-Host "Built $(Join-Path $WhisperDir 'build/bin/Release/whisper-cli.exe')"
