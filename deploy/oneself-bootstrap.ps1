# Public thin entry (Release oneself.ps1): download the verified Windows CLI binary and run it.
# powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
#
# Rules for this file (it runs inside the caller's session under `irm | iex`):
#   - Never call `exit`. Under iex it terminates the user's whole PowerShell window,
#     even on success. Fail with `throw`; succeed by simply returning.
#   - Do not leak variables or env vars into the caller's session: everything runs in
#     a child scope and env changes are restored in `finally`.
#   - Do not run the binary with `& $Bin`: under iex PowerShell may hand the native
#     process a pipe for stdin, and the CLI then refuses to prompt. Start-Process
#     -NoNewWindow makes it inherit the console, so prompts see a real TTY.
#
# The release workflow replaces the next assignment with this Release's tag.
# ONESELF_REF is reserved for an explicit user override; this script's own tag is
# exported only as ONESELF_BUNDLED_REF, which the CLI never uses to downgrade.
$BootstrapRef = 'latest'

try {
  & {
    param([string]$PinnedRef, [object[]]$CliArgs)
    $ErrorActionPreference = 'Stop'
    $ProgressPreference = 'SilentlyContinue'
    try {
      [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    } catch { }

    $repo = if ($env:ONESELF_REPO) { $env:ONESELF_REPO } else { 'ptonlix/OneSelf' }
    $userRef = [string]$env:ONESELF_REF
    $ref = if ($userRef) { $userRef } else { $PinnedRef }
    if ($ref -ne 'latest' -and $ref -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$') {
      throw 'oneself: ONESELF_REF 只能是 latest 或 v1.2.3 这种版本标签'
    }

    $asset = 'oneself-windows-amd64.exe'
    if ($ref -eq 'latest') {
      $base = "https://github.com/$repo/releases/latest/download"
    } else {
      $base = "https://github.com/$repo/releases/download/$ref"
    }
    $cache = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'oneself\cache'
    New-Item -ItemType Directory -Force -Path $cache | Out-Null
    $bin = Join-Path $cache $asset
    $tmpBin = "$bin.$PID.download"
    $sums = Join-Path $cache "SHA256SUMS.$PID"
    try {
      Write-Host "oneself: 下载 $base/$asset"
      Invoke-WebRequest -Uri "$base/$asset" -OutFile $tmpBin -UseBasicParsing
      Invoke-WebRequest -Uri "$base/SHA256SUMS" -OutFile $sums -UseBasicParsing
      $expected = (
        Get-Content -LiteralPath $sums |
        Where-Object { $_ -match ('^\s*[0-9A-Fa-f]{64}\s+\*?' + [regex]::Escape($asset) + '\s*$') } |
        ForEach-Object { ($_.Trim() -split '\s+')[0] } |
        Select-Object -First 1
      )
      if (-not $expected) { throw "oneself: SHA256SUMS 里没有 $asset" }
      $got = (Get-FileHash -Algorithm SHA256 -LiteralPath $tmpBin).Hash
      if ($got.ToLowerInvariant() -ne $expected.ToLowerInvariant()) {
        throw 'oneself: 二进制校验失败'
      }
      Move-Item -LiteralPath $tmpBin -Destination $bin -Force
    } finally {
      Remove-Item -LiteralPath $tmpBin, $sums -Force -ErrorAction SilentlyContinue
    }

    $cli = @($CliArgs | ForEach-Object { [string]$_ })
    $known = @('install', 'update', 'doctor', 'backup', 'restore', 'help', '--help', '-h')
    if ($cli.Count -eq 0) {
      $cli = @('install')
    } elseif ($known -notcontains $cli[0]) {
      $cli = @('install') + $cli
    }

    $yes = ($env:ONESELF_YES -eq '1') -or ($cli -contains '--yes') -or ($cli -contains '-y')
    $needsTty = @('install') -contains $cli[0]
    if ($needsTty -and -not $yes -and [Console]::IsInputRedirected) {
      throw ('oneself: 当前 PowerShell 的标准输入不是终端，无法提问。请在交互式 PowerShell 窗口里运行 ' +
        'irm … | iex，或设置 $env:ONESELF_YES=1 并预先写好 PUBLIC_ORIGIN、OWNER_PASSWORD 等环境变量。')
    }

    # Windows command-line quoting (CommandLineToArgvW rules) for Start-Process.
    $quote = {
      param([string]$a)
      if ($a -eq '') { return '""' }
      if ($a -notmatch '[\s"]') { return $a }
      $s = $a -replace '(\\*)"', '$1$1\"'
      $s = $s -replace '(\\+)$', '$1$1'
      return '"' + $s + '"'
    }
    $argLine = ($cli | ForEach-Object { & $quote $_ }) -join ' '

    $saved = @{
      ONESELF_REF         = $env:ONESELF_REF
      ONESELF_BUNDLED_REF = $env:ONESELF_BUNDLED_REF
      ONESELF_SELF_BIN    = $env:ONESELF_SELF_BIN
    }
    try {
      # Only a user-set ONESELF_REF is passed on (it may force a downgrade).
      if ($userRef) { $env:ONESELF_REF = $userRef } else { Remove-Item Env:ONESELF_REF -ErrorAction SilentlyContinue }
      $env:ONESELF_BUNDLED_REF = $ref
      $env:ONESELF_SELF_BIN = $bin
      $proc = Start-Process -FilePath $bin -ArgumentList $argLine -NoNewWindow -Wait -PassThru
      $code = $proc.ExitCode
    } finally {
      foreach ($name in $saved.Keys) {
        if ($null -ne $saved[$name] -and $saved[$name] -ne '') {
          Set-Item -Path "Env:$name" -Value $saved[$name]
        } else {
          Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
        }
      }
    }
    if ($code -ne 0) {
      throw "oneself: $($cli[0]) 失败（退出码 $code）"
    }
  } $BootstrapRef $args
} finally {
  Remove-Variable -Name BootstrapRef -ErrorAction SilentlyContinue
}
