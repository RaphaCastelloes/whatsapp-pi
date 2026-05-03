$ErrorActionPreference = 'Stop'

$utf8 = [System.Text.UTF8Encoding]::new($false)

try {
    chcp 65001 | Out-Null
} catch {
    # Ignore if the host does not support chcp.
}

[Console]::InputEncoding = $utf8
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$env:LANG = 'pt_BR.UTF-8'
$env:LC_ALL = 'pt_BR.UTF-8'

Set-Location $PSScriptRoot
Set-Location ..

$entryPoint = Join-Path (Get-Location) 'whatsapp-pi.ts'

& pi -e $entryPoint @args
exit $LASTEXITCODE
