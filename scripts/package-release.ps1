param(
  [ValidateSet('runtime', 'source', 'all')]
  [string]$Mode = 'all',

  [string]$OutputDir = 'release',

  [switch]$BuildFirst
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
}

function Get-PackageVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot
  )

  $packageJsonPath = Join-Path $RepoRoot 'package.json'
  $packageJson = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
  return [string]$packageJson.version
}

function Ensure-PathsExist {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [string[]]$RelativePaths
  )

  foreach ($relativePath in $RelativePaths) {
    $fullPath = Join-Path $RepoRoot $relativePath
    if (-not (Test-Path -LiteralPath $fullPath)) {
      throw "Required path not found: $relativePath"
    }
  }
}

function Copy-ReleaseItems {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [string]$StageRoot,

    [Parameter(Mandatory = $true)]
    [string[]]$RelativePaths
  )

  foreach ($relativePath in $RelativePaths) {
    $sourcePath = Join-Path $RepoRoot $relativePath
    $destinationPath = Join-Path $StageRoot $relativePath
    $destinationParent = Split-Path -Parent $destinationPath

    if (-not (Test-Path -LiteralPath $destinationParent)) {
      New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }

    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
  }
}

function New-ArchiveFromItems {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RepoRoot,

    [Parameter(Mandatory = $true)]
    [string]$ArchiveName,

    [Parameter(Mandatory = $true)]
    [string[]]$RelativePaths,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir
  )

  $tempRoot = Join-Path $RepoRoot '.tmp\package-release'
  $stageRoot = Join-Path $tempRoot $ArchiveName
  $resolvedOutputDir = Join-Path $RepoRoot $OutputDir
  $archivePath = Join-Path $resolvedOutputDir ($ArchiveName + '.zip')

  Ensure-PathsExist -RepoRoot $RepoRoot -RelativePaths $RelativePaths

  if (Test-Path -LiteralPath $stageRoot) {
    Remove-Item -LiteralPath $stageRoot -Recurse -Force
  }

  if (-not (Test-Path -LiteralPath $resolvedOutputDir)) {
    New-Item -ItemType Directory -Path $resolvedOutputDir -Force | Out-Null
  }

  if (-not (Test-Path -LiteralPath $tempRoot)) {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
  }

  New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null
  Copy-ReleaseItems -RepoRoot $RepoRoot -StageRoot $stageRoot -RelativePaths $RelativePaths

  if (Test-Path -LiteralPath $archivePath) {
    Remove-Item -LiteralPath $archivePath -Force
  }

  Compress-Archive -Path (Join-Path $stageRoot '*') -DestinationPath $archivePath -CompressionLevel Optimal
  return $archivePath
}

$repoRoot = Get-RepoRoot
$version = Get-PackageVersion -RepoRoot $repoRoot

if ($BuildFirst) {
  Push-Location $repoRoot
  try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
      throw "Build failed with exit code $LASTEXITCODE"
    }
  }
  finally {
    Pop-Location
  }
}

$runtimeItems = @(
  'dist',
  'decryption-tool',
  'public',
  'docs',
  'prompts',
  'LICENSE',
  'MCP.md',
  'NOTICE.md',
  'README.md',
  'package.json',
  'pnpm-lock.yaml'
)

$sourceItems = @(
  'src',
  'scripts',
  'decryption-tool',
  'public',
  'docs',
  'prompts',
  '.editorconfig',
  '.gitignore',
  'LICENSE',
  'MCP.md',
  'NOTICE.md',
  'README.md',
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.json',
  'tsconfig.cli.json',
  'vite.config.ts'
)

$createdArchives = @()

switch ($Mode) {
  'runtime' {
    $createdArchives += New-ArchiveFromItems `
      -RepoRoot $repoRoot `
      -ArchiveName ("MCP-WEDECODEMCP-runtime-v{0}" -f $version) `
      -RelativePaths $runtimeItems `
      -OutputDir $OutputDir
  }
  'source' {
    $createdArchives += New-ArchiveFromItems `
      -RepoRoot $repoRoot `
      -ArchiveName ("MCP-WEDECODEMCP-source-v{0}" -f $version) `
      -RelativePaths $sourceItems `
      -OutputDir $OutputDir
  }
  'all' {
    $createdArchives += New-ArchiveFromItems `
      -RepoRoot $repoRoot `
      -ArchiveName ("MCP-WEDECODEMCP-runtime-v{0}" -f $version) `
      -RelativePaths $runtimeItems `
      -OutputDir $OutputDir
    $createdArchives += New-ArchiveFromItems `
      -RepoRoot $repoRoot `
      -ArchiveName ("MCP-WEDECODEMCP-source-v{0}" -f $version) `
      -RelativePaths $sourceItems `
      -OutputDir $OutputDir
  }
}

Write-Host ''
Write-Host 'Created archives:' -ForegroundColor Green
foreach ($archive in $createdArchives) {
  Write-Host " - $archive"
}
