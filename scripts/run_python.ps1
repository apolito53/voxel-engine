param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $PythonArgs
)

$ErrorActionPreference = "Stop"

function Test-PythonCandidate {
  param([string] $CommandPath)

  if (-not $CommandPath) {
    return $false
  }

  try {
    & $CommandPath --version *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

$candidates = @()
if ($env:CODEX_PYTHON) {
  $candidates += $env:CODEX_PYTHON
}

$pythonCommand = Get-Command python -ErrorAction SilentlyContinue
if ($pythonCommand) {
  $candidates += $pythonCommand.Source
}

$launcherCommand = Get-Command py -ErrorAction SilentlyContinue
if ($launcherCommand) {
  $candidates += $launcherCommand.Source
}

$bundledPython = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe"
$candidates += $bundledPython

foreach ($candidate in $candidates) {
  if (Test-PythonCandidate $candidate) {
    & $candidate @PythonArgs
    exit $LASTEXITCODE
  }
}

Write-Error "No usable Python executable found. Install Python or set CODEX_PYTHON to a python.exe path."
exit 127
