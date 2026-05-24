param(
  [switch]$DryRun,
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Write-Step([string]$message) {
  Write-Host "[voice-auto] $message"
}

function Assert-ElevenLabsKey {
  $key = $env:ELEVENLABS_API_KEY
  if ([string]::IsNullOrWhiteSpace($key)) {
    throw "Brak ELEVENLABS_API_KEY. Ustaw poprawny klucz w .env.local lub zmiennych środowiskowych."
  }
  if ($key -match "\*") {
    throw "ELEVENLABS_API_KEY wygląda na placeholder (zawiera '*'). Podstaw realny klucz i uruchom ponownie."
  }
}

function Resolve-VoiceId {
  $voiceId = [Environment]::GetEnvironmentVariable("ELEVENLABS_VOICE_ID", "Process")
  if ([string]::IsNullOrWhiteSpace($voiceId)) {
    Write-Step "Brak ELEVENLABS_VOICE_ID w env. Użyję wartości domyślnej z generatora."
    return
  }
  Write-Step "Używam ELEVENLABS_VOICE_ID z env."
}

function Load-LocalEnv {
  $envPath = Join-Path (Get-Location) ".env.local"
  if (-not (Test-Path $envPath)) { return }
  foreach ($line in Get-Content $envPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith("#")) { continue }
    if ($trimmed -notmatch "^([A-Za-z_][A-Za-z0-9_]*)=(.*)$") { continue }
    $key = $matches[1]
    $value = $matches[2].Trim("'`"")
    $existing = [Environment]::GetEnvironmentVariable($key, "Process")
    if (-not [string]::IsNullOrWhiteSpace($existing)) { continue }
    [Environment]::SetEnvironmentVariable($key, $value, "Process")
  }
}

function Run-Generator([string[]]$generatorArgs) {
  & node --experimental-strip-types scripts/generate-neura-voices.ts @generatorArgs
  if ($LASTEXITCODE -ne 0) {
    throw "Generator zakończył się błędem. Parametry: $($generatorArgs -join ' '). Sprawdź komunikat błędu z linii powyżej (np. invalid_api_key albo voice_not_found)."
  }
}

Write-Step "Dry-run brakujących głosów: legacy"
Run-Generator @("--source", "legacy", "--dry-run")

Write-Step "Dry-run brakujących głosów: dialogue-v2"
Run-Generator @("--source", "dialogue-v2", "--dry-run")

if ($DryRun) {
  Write-Step "Tryb DryRun - zakończono bez generowania plików."
  exit 0
}

Load-LocalEnv
Assert-ElevenLabsKey
Resolve-VoiceId

Write-Step "Generowanie brakujących głosów: legacy"
$legacyArgs = @("--source", "legacy")
if ($Force) { $legacyArgs += "--force" }
Run-Generator $legacyArgs

Write-Step "Generowanie brakujących głosów: dialogue-v2 (opus+mp3)"
$dialogueArgs = @("--source", "dialogue-v2", "--with-fallback")
if ($Force) { $dialogueArgs += "--force" }
Run-Generator $dialogueArgs

Write-Step "Zakończono."
