$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SiteRoot = Join-Path $Root 'site'
$RuntimeDir = Join-Path $Root '.runtime'
$ServerScript = Join-Path $PSScriptRoot 'server.ps1'
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

function Test-PortFree {
  param([int]$Port)
  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Parse('127.0.0.1'), $Port)
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    if ($listener) {
      $listener.Stop()
    }
  }
}

function Test-ServerReady {
  param([int]$Port)
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

try {
  Write-LauncherLog 'RUN requested.'

  $indexPath = Join-Path $SiteRoot 'index.html'
  if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf)) {
    throw "Nie znaleziono site\index.html. Pakiet przenosny jest niekompletny."
  }

  if (Test-Path -LiteralPath $StopFile) {
    Remove-Item -LiteralPath $StopFile -Force
  }

  $existingPort = $null
  if (Test-Path -LiteralPath $PortFile -PathType Leaf) {
    $portText = (Get-Content -LiteralPath $PortFile -TotalCount 1).Trim()
    if ([int]::TryParse($portText, [ref]$existingPort) -and (Test-ServerReady $existingPort)) {
      $url = "http://127.0.0.1:$existingPort/"
      Write-LauncherLog "Existing daemon is ready on $url"
      Start-Process $url
      Write-Host "Demo juz dziala: $url"
      exit 0
    }
  }

  $port = $null
  foreach ($candidate in 41773..41820) {
    if (Test-PortFree $candidate) {
      $port = $candidate
      break
    }
  }
  if (-not $port) {
    throw 'Nie znaleziono wolnego portu w zakresie 41773-41820.'
  }

  $serverArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', ('"{0}"' -f $ServerScript),
    '-Port', $port,
    '-SiteRoot', ('"{0}"' -f $SiteRoot),
    '-RuntimeDir', ('"{0}"' -f $RuntimeDir)
  )

  $process = Start-Process -FilePath powershell.exe -WindowStyle Hidden -ArgumentList $serverArgs -PassThru
  Write-LauncherLog "Started daemon pid=$($process.Id) port=$port"

  $ready = $false
  for ($attempt = 0; $attempt -lt 50; $attempt += 1) {
    Start-Sleep -Milliseconds 200
    if (Test-ServerReady $port) {
      $ready = $true
      break
    }
  }

  if (-not $ready) {
    throw "Daemon nie odpowiedzial na porcie $port. Sprawdz .runtime\server.log."
  }

  $url = "http://127.0.0.1:$port/"
  Start-Process $url
  Write-LauncherLog "Opened browser at $url"
  Write-Host "Demo uruchomione: $url"
  Write-Host "Aby zatrzymac daemona, kliknij STOP.cmd."
} catch {
  Write-LauncherLog "ERROR: $($_.Exception.Message)"
  Write-Error $_.Exception.Message
  exit 1
}
