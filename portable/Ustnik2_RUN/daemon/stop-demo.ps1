$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$RuntimeDir = Join-Path $Root '.runtime'
$PidFile = Join-Path $RuntimeDir 'ustnik-demo.pid'
$PortFile = Join-Path $RuntimeDir 'ustnik-demo.port'
$StopFile = Join-Path $RuntimeDir 'ustnik-demo.stop'
$LogPath = Join-Path $RuntimeDir 'launcher.log'

New-Item -ItemType Directory -Force $RuntimeDir | Out-Null

function Write-LauncherLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
}

try {
  Write-LauncherLog 'STOP requested.'
  Set-Content -LiteralPath $StopFile -Value (Get-Date -Format o)

  $port = $null
  if (Test-Path -LiteralPath $PortFile -PathType Leaf) {
    $portText = (Get-Content -LiteralPath $PortFile -TotalCount 1).Trim()
    [void][int]::TryParse($portText, [ref]$port)
  }

  if ($port) {
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$port/" -TimeoutSec 2 | Out-Null
    } catch {
      # Request is only used to wake the listener.
    }
  }

  Start-Sleep -Milliseconds 700

  if (Test-Path -LiteralPath $PidFile -PathType Leaf) {
    $pidText = (Get-Content -LiteralPath $PidFile -TotalCount 1).Trim()
    $daemonPid = $null
    if ([int]::TryParse($pidText, [ref]$daemonPid)) {
      $process = Get-Process -Id $daemonPid -ErrorAction SilentlyContinue
      if ($process) {
        Stop-Process -Id $daemonPid -Force
        Write-LauncherLog "Stopped daemon pid=$daemonPid"
      }
    }
  }

  if (Test-Path -LiteralPath $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force
  }
  if (Test-Path -LiteralPath $StopFile) {
    Remove-Item -LiteralPath $StopFile -Force
  }

  Write-Host 'Demo zatrzymane.'
} catch {
  Write-LauncherLog "ERROR: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
