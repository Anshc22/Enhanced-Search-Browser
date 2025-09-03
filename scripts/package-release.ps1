param()

$root = Split-Path -Parent $MyInvocation.MyCommand.Definition
$out = Join-Path $root "release"
if (!(Test-Path $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

# collect files to zip (exclude common dev paths) - kept for reference
$excludes = @('node_modules','tests','.git','.vscode','.taskmaster','tmp-user-data')

Write-Output "Creating zip package..."
Push-Location $root
$zipName = Join-Path $out ("enhanced-search-" + (Get-Date -Format yyyyMMddHHmmss) + ".zip")

# Use system compression to zip the whole folder, user can adjust excludes manually if needed
[System.IO.Compression.ZipFile]::CreateFromDirectory((Get-Location).Path, $zipName)
Pop-Location
Write-Output "Package created: $zipName"


