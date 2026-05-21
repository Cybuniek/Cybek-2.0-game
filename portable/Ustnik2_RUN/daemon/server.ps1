param(
  [Parameter(Mandatory = $true)]
  [int]$Port,

  [Parameter(Mandatory = $true)]
  [string]$SiteRoot,

  [Parameter(Mandatory = $true)]
  [string]$RuntimeDir
)

$ErrorActionPreference = 'Stop'

$SiteRoot = (Resolve-Path $SiteRoot).Path
New-Item -ItemType Directory -Force $RuntimeDir | Out-Null

$PidFile = Join-Path $RuntimeDir 'ustnik-demo.pid'
$PortFile = Join-Path $RuntimeDir 'ustnik-demo.port'
$StopFile = Join-Path $RuntimeDir 'ustnik-demo.stop'
$LogPath = Join-Path $RuntimeDir 'server.log'

function Write-ServerLog {
  param([string]$Message)
  $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message"
}

function Get-MimeType {
  param([string]$Path)
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    '.html' { return 'text/html; charset=utf-8' }
    '.js' { return 'text/javascript; charset=utf-8' }
    '.mjs' { return 'text/javascript; charset=utf-8' }
    '.css' { return 'text/css; charset=utf-8' }
    '.json' { return 'application/json; charset=utf-8' }
    '.png' { return 'image/png' }
    '.jpg' { return 'image/jpeg' }
    '.jpeg' { return 'image/jpeg' }
    '.webp' { return 'image/webp' }
    '.svg' { return 'image/svg+xml' }
    '.ico' { return 'image/x-icon' }
    '.ogg' { return 'audio/ogg' }
    '.mp3' { return 'audio/mpeg' }
    '.wav' { return 'audio/wav' }
    '.txt' { return 'text/plain; charset=utf-8' }
    default { return 'application/octet-stream' }
  }
}

function Resolve-StaticPath {
  param([string]$UrlPath)

  $relative = [Uri]::UnescapeDataString($UrlPath.TrimStart('/')).Replace('/', [System.IO.Path]::DirectorySeparatorChar)
  if ([string]::IsNullOrWhiteSpace($relative)) {
    $relative = 'index.html'
  }

  $candidate = [System.IO.Path]::GetFullPath((Join-Path $SiteRoot $relative))
  $rootFull = [System.IO.Path]::GetFullPath($SiteRoot)
  $rootWithSeparator = $rootFull.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar

  if ($candidate -ne $rootFull -and -not $candidate.StartsWith($rootWithSeparator, [StringComparison]::OrdinalIgnoreCase)) {
    return $null
  }

  if (Test-Path -LiteralPath $candidate -PathType Container) {
    $candidate = Join-Path $candidate 'index.html'
  }

  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    return $candidate
  }

  return Join-Path $SiteRoot 'index.html'
}

function Send-Response {
  param(
    [System.Net.HttpListenerContext]$Context,
    [int]$StatusCode,
    [byte[]]$Bytes,
    [string]$ContentType
  )

  $response = $Context.Response
  $response.StatusCode = $StatusCode
  $response.ContentType = $ContentType
  $response.Headers['Cache-Control'] = 'no-store'
  $response.ContentLength64 = $Bytes.Length

  if ($Context.Request.HttpMethod -ne 'HEAD') {
    $response.OutputStream.Write($Bytes, 0, $Bytes.Length)
  }
  $response.Close()
}

$listener = [System.Net.HttpListener]::new()
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)

try {
  Set-Content -LiteralPath $PidFile -Value $PID
  Set-Content -LiteralPath $PortFile -Value $Port
  if (Test-Path -LiteralPath $StopFile) {
    Remove-Item -LiteralPath $StopFile -Force
  }

  $listener.Start()
  Write-ServerLog "Daemon started on $prefix for $SiteRoot"

  while ($listener.IsListening) {
    if (Test-Path -LiteralPath $StopFile) {
      break
    }

    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(250)) {
      if (Test-Path -LiteralPath $StopFile) {
        break
      }
    }

    if (Test-Path -LiteralPath $StopFile) {
      break
    }

    $context = $task.GetAwaiter().GetResult()
    try {
      $path = Resolve-StaticPath $context.Request.Url.AbsolutePath
      if (-not $path) {
        $body = [System.Text.Encoding]::UTF8.GetBytes('403 Forbidden')
        Send-Response $context 403 $body 'text/plain; charset=utf-8'
        continue
      }

      $bytes = [System.IO.File]::ReadAllBytes($path)
      Send-Response $context 200 $bytes (Get-MimeType $path)
    } catch {
      Write-ServerLog "Request error: $($_.Exception.Message)"
      $body = [System.Text.Encoding]::UTF8.GetBytes('500 Internal Server Error')
      Send-Response $context 500 $body 'text/plain; charset=utf-8'
    }
  }
} catch {
  Write-ServerLog "FATAL: $($_.Exception.Message)"
  throw
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
  if (Test-Path -LiteralPath $PidFile) {
    Remove-Item -LiteralPath $PidFile -Force
  }
  if (Test-Path -LiteralPath $StopFile) {
    Remove-Item -LiteralPath $StopFile -Force
  }
  Write-ServerLog 'Daemon stopped.'
}
