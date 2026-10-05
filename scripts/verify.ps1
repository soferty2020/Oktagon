<#
.SYNOPSIS
  Локальная проверка монорепо OCTAGON: build, typecheck, unit-тесты, e2e, lint.

.DESCRIPTION
  Скрипт вызывает компилятор и тест-раннеры напрямую, не через вложенные
  pnpm-скрипты. Это нужно для сред, где запрещен запуск процессов с
  перенаправленными pipe (вложенный spawn падает с EPERM).

  На обычной машине эквивалент — `pnpm build`, `pnpm test` и т.д.

.PARAMETER Step
  all | packages | build | test | e2e | lint. По умолчанию all.

.PARAMETER SkipInstall
  Не запускать pnpm install.

.EXAMPLE
  pwsh scripts/verify.ps1
  pwsh scripts/verify.ps1 -Step e2e
#>
[CmdletBinding()]
param(
  [ValidateSet('all', 'packages', 'build', 'test', 'e2e', 'lint')]
  [string]$Step = 'all',
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

$results = [ordered]@{}

function Invoke-Step {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][scriptblock]$Action
  )

  Write-Host ''
  Write-Host "=== ${Name} ===" -ForegroundColor Cyan
  try {
    & $Action
    if ($LASTEXITCODE -ne 0) { throw "step exited with code $LASTEXITCODE" }
    $results[$Name] = 'PASS'
    Write-Host "--- ${Name}: PASS" -ForegroundColor Green
  } catch {
    $results[$Name] = "FAIL ($($_.Exception.Message))"
    Write-Host "--- ${Name}: FAIL ($($_.Exception.Message))" -ForegroundColor Red
  }
}

function Resolve-Pnpm {
  $corepackRoot = Join-Path (Split-Path -Parent $repoRoot) '.tools\corepack\v1\pnpm'
  if (Test-Path $corepackRoot) {
    $candidate = Get-ChildItem $corepackRoot -Directory |
      Sort-Object Name -Descending |
      ForEach-Object { Join-Path $_.FullName 'bin\pnpm.cjs' } |
      Where-Object { Test-Path $_ } |
      Select-Object -First 1
    if ($candidate) { return $candidate }
  }
  return $null
}

# Раскладка node_modules — hoisted (.npmrc): инструменты лежат в корневом
# node_modules, но скрипт умеет найти их и в локальном node_modules пакета.
function Resolve-Tool {
  param(
    [Parameter(Mandatory)][string]$Name,
    [string]$PackageDir = ''
  )

  $candidates = @()
  if ($PackageDir) { $candidates += (Join-Path $PackageDir "node_modules\.bin\$Name.CMD") }
  $candidates += (Join-Path $repoRoot "node_modules\.bin\$Name.CMD")

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) { return $candidate }
  }
  throw "Инструмент '$Name' не найден. Выполните pnpm install."
}

$pnpm = Resolve-Pnpm
if (-not $SkipInstall) {
  if ($pnpm) {
    Invoke-Step 'install (pnpm, --ignore-scripts)' {
      & node $pnpm install --ignore-scripts
    }
  } else {
    Write-Host 'pnpm не найден в .tools/corepack — пропускаю install (используйте pnpm install вручную).' -ForegroundColor Yellow
  }
}

$contracts = Join-Path $repoRoot 'packages\contracts'
$config = Join-Path $repoRoot 'packages\config'
$api = Join-Path $repoRoot 'apps\api'

if ($Step -in @('all', 'packages', 'build')) {
  $tsc = Resolve-Tool -Name 'tsc'
  Invoke-Step 'build @octagon/contracts' { & $tsc -p (Join-Path $contracts 'tsconfig.build.json') }
  Invoke-Step 'build @octagon/config' { & $tsc -p (Join-Path $config 'tsconfig.build.json') }
  Invoke-Step 'typecheck @octagon/contracts' { & $tsc --noEmit -p (Join-Path $contracts 'tsconfig.json') }
  Invoke-Step 'typecheck @octagon/config' { & $tsc --noEmit -p (Join-Path $config 'tsconfig.json') }
}

if ($Step -in @('all', 'build')) {
  $tscApi = Resolve-Tool -Name 'tsc' -PackageDir $api
  $nest = Resolve-Tool -Name 'nest' -PackageDir $api
  Invoke-Step 'typecheck @octagon/api' { & $tscApi --noEmit -p (Join-Path $api 'tsconfig.json') }
  Invoke-Step 'build @octagon/api (nest build)' {
    Push-Location $api
    try { & $nest build } finally { Pop-Location }
  }
}

if ($Step -in @('all', 'test')) {
  $jestConfig = Resolve-Tool -Name 'jest' -PackageDir $config
  $jestApi = Resolve-Tool -Name 'jest' -PackageDir $api
  Invoke-Step 'unit tests @octagon/config' {
    Push-Location $config
    try { & $jestConfig --config jest.config.json --runInBand } finally { Pop-Location }
  }
  Invoke-Step 'unit tests @octagon/api' {
    Push-Location $api
    try { & $jestApi --runInBand --passWithNoTests } finally { Pop-Location }
  }
}

if ($Step -in @('all', 'e2e')) {
  $jestE2e = Resolve-Tool -Name 'jest' -PackageDir $api
  Invoke-Step 'e2e @octagon/api (без БД)' {
    Push-Location $api
    try {
      & $jestE2e --config test/jest-e2e.json --runInBand --passWithNoTests
    } finally { Pop-Location }
  }
  Invoke-Step 'e2e @octagon/api (с БД)' {
    Push-Location $api
    try {
      & $jestE2e --config test/jest-e2e-db.json --runInBand --passWithNoTests
    } finally { Pop-Location }
  }
}

if ($Step -in @('all', 'lint')) {
  $biome = Resolve-Tool -Name 'biome'
  Invoke-Step 'lint (biome)' {
    Push-Location $repoRoot
    try { & $biome lint . } finally { Pop-Location }
  }
  Invoke-Step 'контракт openapi.yaml' {
    Push-Location $repoRoot
    try { & node (Join-Path $repoRoot 'scripts\validate-openapi.mjs') } finally { Pop-Location }
  }
}

Write-Host ''
Write-Host '=== Итог ===' -ForegroundColor Cyan
$results.GetEnumerator() | ForEach-Object { '{0,-40} {1}' -f $_.Key, $_.Value }

$failed = @($results.GetEnumerator() | Where-Object { $_.Value -ne 'PASS' })
if ($failed.Count -gt 0) {
  Write-Host "`nПровалено шагов: $($failed.Count)" -ForegroundColor Red
  exit 1
}
Write-Host "`nВсе шаги пройдены." -ForegroundColor Green
exit 0
