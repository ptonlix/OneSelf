# OneSelf Windows installer. Pipe into iex, or run as a file.
# powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
# It only calls Docker Compose. It does not install an ingress, publish database ports,
# infer PUBLIC_ORIGIN, or write agent credentials.
# The release workflow replaces the next assignment with a version tag.
$script:BundledRef = ''

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$script:Repo = if ($env:ONESELF_REPO) { $env:ONESELF_REPO } else { 'ptonlix/OneSelf' }
$script:ImageRepo = if ($env:ONESELF_IMAGE_REPO) { $env:ONESELF_IMAGE_REPO } else { 'docker.io/ptonlix/oneself' }
$script:Command = 'install'
$script:Dry = $false
$script:Yes = $env:ONESELF_YES -eq '1'
$script:Root = $null
$script:DirSource = 'default'
$script:ResolvedRef = $null

function Test-Color {
  return ($env:NO_COLOR -eq $null -or $env:NO_COLOR -eq '') -and $env:ONESELF_PLAIN -ne '1' -and -not [Console]::IsOutputRedirected
}

function Write-Tone {
  param([string]$Text, [string]$Tone)
  if (-not (Test-Color)) {
    Write-Host $Text
    return
  }
  $color = 'Gray'
  if ($Tone -eq 'teal') { $color = 'Cyan' }
  elseif ($Tone -eq 'blue') { $color = 'Blue' }
  elseif ($Tone -eq 'violet') { $color = 'Magenta' }
  elseif ($Tone -eq 'amber') { $color = 'Yellow' }
  elseif ($Tone -eq 'rose') { $color = 'Red' }
  elseif ($Tone -eq 'bold') { $color = 'White' }
  Write-Host $Text -ForegroundColor $color
}

function Write-Ok { param([string]$Text) Write-Tone "✓ $Text" 'teal' }
function Write-Info { param([string]$Text) Write-Tone "· $Text" 'blue' }
function Write-Warn { param([string]$Text) Write-Tone "! $Text" 'amber' }
function Fail {
  param([string]$Text)
  Write-Tone "✗ $Text" 'rose'
  throw $Text
}

function Show-Mark {
  Write-Host ''
  Write-Tone '        ██████' 'teal'
  Write-Tone '      ██      ██' 'teal'
  Write-Tone '    ██          ██' 'blue'
  Write-Tone '    ██    ██    ██' 'blue'
  Write-Tone '    ██          ██' 'violet'
  Write-Tone '      ██      ██' 'violet'
  Write-Tone '        ██████' 'violet'
  Write-Host ''
  Write-Tone '    ONESELF' 'bold'
  Write-Tone '    one context. every agent.' 'blue'
  Write-Tone '    建立一份关于你的上下文，让每个 AI 都了解你，在隐私与效率之间取得平衡' 'violet'
  Write-Host ''
}

function Test-WindowsHost {
  if ($env:OS -eq 'Windows_NT') { return $true }
  return $false
}

function Get-DefaultDir {
  if (Test-WindowsHost) {
    $base = $env:LOCALAPPDATA
    if (-not $base) { $base = Join-Path $env:USERPROFILE 'AppData\Local' }
    if (-not $base) { Fail 'Windows 上找不到 LOCALAPPDATA 或 USERPROFILE' }
    return (Join-Path $base 'oneself')
  }
  $base = $env:XDG_DATA_HOME
  if (-not $base) { $base = Join-Path $HOME '.local/share' }
  return (Join-Path $base 'oneself')
}

function Resolve-InstallDir {
  param([string]$Raw)
  if (-not $Raw) { Fail '安装目录不能为空' }
  if ($Raw.EndsWith('\') -or $Raw.EndsWith('/')) { Fail '安装目录不能以斜杠结尾' }
  return [System.IO.Path]::GetFullPath($Raw)
}

function Test-SourceCheckout {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  $dev = Join-Path $Dir 'compose.dev.yaml'
  $apps = Join-Path $Dir 'apps/server'
  return ((Test-Path -LiteralPath $dev) -and (Test-Path -LiteralPath $apps))
}

function Test-InstalledLayout {
  param([string]$Dir)
  if (-not $Dir) { return $false }
  $compose = Join-Path $Dir 'compose.yaml'
  $caddy = Join-Path $Dir 'deploy/Caddyfile'
  if (-not (Test-Path -LiteralPath $compose)) { return $false }
  if (-not (Test-Path -LiteralPath $caddy)) { return $false }
  if (Test-SourceCheckout $Dir) { return $false }
  return $true
}

function Resolve-TargetDir {
  if ($env:ONESELF_DIR) {
    $script:DirSource = 'explicit'
    return (Resolve-InstallDir $env:ONESELF_DIR)
  }
  if ($PSScriptRoot) {
    if (Test-InstalledLayout $PSScriptRoot) {
      $script:DirSource = 'installed'
      return (Resolve-InstallDir $PSScriptRoot)
    }
    $parent = Split-Path -Parent $PSScriptRoot
    $parentCompose = Join-Path $parent 'compose.yaml'
    $siblingCaddy = Join-Path $PSScriptRoot 'Caddyfile'
    if ((Test-Path -LiteralPath $parentCompose) -and (Test-Path -LiteralPath $siblingCaddy)) {
      if (-not (Test-SourceCheckout $parent)) {
        $script:DirSource = 'installed'
        return (Resolve-InstallDir $parent)
      }
    }
  }
  $script:DirSource = 'default'
  return (Resolve-InstallDir (Get-DefaultDir))
}

function Show-InstallDir {
  Write-Host ''
  Write-Tone '安装目录' 'bold'
  Write-Tone "  $($script:Root)" 'teal'
  if ($script:DirSource -eq 'explicit') { Write-Info '这是你指定的目录。' }
  elseif ($script:DirSource -eq 'installed') { Write-Info '沿用这一份已经装好的目录。' }
  else { Write-Info '默认目录。换地方用 --dir 或 ONESELF_DIR。' }
}

function Test-Origin {
  param([string]$Origin)
  if ($env:ONESELF_ALLOW_HTTP -eq '1' -and $Origin -match '^http://') {
    $rest = $Origin.Substring(7)
  }
  elseif ($Origin -match '^https://') {
    $rest = $Origin.Substring(8)
  }
  else { return $false }
  if ($rest -match '[/\s?#\\]' -or $rest -eq '' -or $rest -match '@') { return $false }
  if ($rest -eq 'example.invalid' -or $rest -like '*.example.invalid') { return $false }
  if ($rest -eq 'localhost' -or $rest -eq '127.0.0.1' -or $rest -like '127.0.0.1:*') { return $false }
  if ($rest -notmatch '^[A-Za-z0-9._:-]+$') { return $false }
  return $true
}

function Test-Secret {
  param([string]$Value)
  if (-not $Value) { return $false }
  if ($Value -eq 'change-me' -or $Value -eq 'changeme' -or $Value -eq 'password' -or $Value -eq 'secret') { return $false }
  if ($Value.Contains('$') -or $Value.Contains('`') -or $Value.Contains("`n")) { return $false }
  return $true
}

function Test-ExampleSecret {
  param([string]$Value)
  if (-not $Value) { return $true }
  if ($Value -eq 'change-me') { return $true }
  return $false
}

function Test-Profile {
  param([string]$Name)
  return $Name -eq 'cloudflared' -or $Name -eq 'caddy' -or $Name -eq 'tailscale'
}

function Read-EnvValue {
  param([string]$Path, [string]$Key)
  if (-not (Test-Path $Path)) { return '' }
  $found = ''
  foreach ($line in [System.IO.File]::ReadAllLines($Path)) {
    if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
    $eq = $line.IndexOf('=')
    $name = $line.Substring(0, $eq).Trim()
    if ($name -ne $Key) { continue }
    $found = $line.Substring($eq + 1)
  }
  if ($found.StartsWith('"') -and $found.EndsWith('"') -and $found.Length -ge 2) {
    $found = $found.Substring(1, $found.Length - 2).Replace('\"', '"')
  }
  return $found
}

function Write-EnvValue {
  param([string]$Path, [string]$Key, [string]$Value)
  if ($Value -match "`n|`r") { Fail "$Key 不能含换行" }
  $lines = @()
  if (Test-Path $Path) { $lines = [System.IO.File]::ReadAllLines($Path) }
  $found = $false
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($line in $lines) {
    $eq = $line.IndexOf('=')
    if ($eq -gt 0) {
      $name = $line.Substring(0, $eq).Trim()
      if ($name -eq $Key) {
        if (-not $found) { $out.Add("$Key=$Value") }
        $found = $true
        continue
      }
    }
    $out.Add($line)
  }
  if (-not $found) { $out.Add("$Key=$Value") }
  $utf8 = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($Path, $out.ToArray(), $utf8)
}

function New-HexSecret {
  $bytes = New-Object byte[] 24
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  return ([System.BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Read-PlainSecret {
  param([string]$Prompt)
  $secure = Read-Host $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Get-GitHubHeaders {
  return @{ 'User-Agent' = 'oneself-installer'; 'Accept' = 'application/vnd.github+json' }
}

function Resolve-Ref {
  if ($env:ONESELF_REF) { $script:ResolvedRef = $env:ONESELF_REF }
  elseif ($script:BundledRef) { $script:ResolvedRef = $script:BundledRef }
  else { $script:ResolvedRef = 'latest' }
  if ($script:ResolvedRef -ne 'latest' -and $script:ResolvedRef -notmatch '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$') {
    Fail 'ONESELF_REF 只能是 latest 或 v1.2.3 这种版本标签'
  }
  if ($script:ResolvedRef -eq 'latest') {
    $api = "https://api.github.com/repos/$($script:Repo)/releases/latest"
    try {
      $meta = Invoke-RestMethod -Headers (Get-GitHubHeaders) -Uri $api
    }
    catch {
      $status = ''
      if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
      if ($status -eq 404) { Fail "还没有正式 Release（HTTP 404）：$api" }
      Fail "无法读取 GitHub Release（HTTP $status）：$api"
    }
    if (-not $meta.tag_name) { Fail "无法从 GitHub Release 解析版本标签：$api" }
    $script:ResolvedRef = [string]$meta.tag_name
  }
}

function Save-Url {
  param([string]$Url, [string]$Dest)
  Invoke-WebRequest -Headers (Get-GitHubHeaders) -Uri $Url -OutFile $Dest -UseBasicParsing
}

function Copy-Launchers {
  param([string]$Root)
  $sh = Join-Path $Root 'deploy/oneself.sh'
  $ps1 = Join-Path $Root 'deploy/oneself.ps1'
  if (Test-Path -LiteralPath $sh) {
    Copy-Item -LiteralPath $sh -Destination (Join-Path $Root 'oneself.sh') -Force
  }
  if (Test-Path -LiteralPath $ps1) {
    Copy-Item -LiteralPath $ps1 -Destination (Join-Path $Root 'oneself.ps1') -Force
  }
}

function Save-RawOrFail {
  param([string]$Url, [string]$Dest)
  try { Save-Url $Url $Dest }
  catch { Fail "下载失败：$Url" }
}

function Install-Bundle {
  param([string]$Root, [string]$Tag)
  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("oneself-" + [System.Guid]::NewGuid().ToString('n'))
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    $base = "https://github.com/$($script:Repo)/releases/download/$Tag"
    $bundle = Join-Path $tmp 'bundle.tgz'
    $sums = Join-Path $tmp 'SHA256SUMS'
    $ok = $true
    try {
      Save-Url "$base/oneself-compose.tar.gz" $bundle
      Save-Url "$base/SHA256SUMS" $sums
    }
    catch { $ok = $false }
    if ($ok) {
      $expected = $null
      foreach ($line in [System.IO.File]::ReadAllLines($sums)) {
        if ($line -match '^([0-9a-fA-F]{64})\s+oneself-compose\.tar\.gz$') { $expected = $Matches[1].ToLower() }
      }
      if (-not $expected) { Fail 'SHA256SUMS 里没有 oneself-compose.tar.gz' }
      $got = (Get-FileHash -Algorithm SHA256 $bundle).Hash.ToLower()
      if ($got -ne $expected) { Fail '安装包校验失败' }
      & tar -xzf $bundle -C $Root
      if ($LASTEXITCODE -ne 0) { Fail '无法解开安装包' }
    }
    else {
      Write-Warn 'Release 附件还不在，改为取该标签的仓库文件'
      New-Item -ItemType Directory -Force -Path (Join-Path $Root 'deploy') | Out-Null
      $raw = "https://raw.githubusercontent.com/$($script:Repo)/$Tag"
      Save-RawOrFail "$raw/compose.yaml" (Join-Path $Root 'compose.yaml')
      Save-RawOrFail "$raw/.env.example" (Join-Path $Root '.env.example')
      Save-RawOrFail "$raw/deploy/Caddyfile" (Join-Path $Root 'deploy/Caddyfile')
      Save-RawOrFail "$raw/deploy/oneself.sh" (Join-Path $Root 'deploy/oneself.sh')
      Save-RawOrFail "$raw/deploy/oneself.ps1" (Join-Path $Root 'deploy/oneself.ps1')
    }
    Copy-Launchers $Root
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [System.IO.File]::WriteAllText((Join-Path $Root '.oneself-release'), "ref=$Tag`n", $utf8)
  }
  finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  }
}

function Assert-Compose {
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if (-not $docker) { Fail '需要 Docker Desktop，并且 Docker Compose v2 在 PATH 里。这个脚本不安装 Docker。' }
  & docker compose version | Out-Null
  if ($LASTEXITCODE -ne 0) { Fail '需要 Docker Compose v2。' }
}

function Invoke-Compose {
  param([string]$Profile, [string[]]$ComposeArgs)
  $previous = $env:COMPOSE_PROFILES
  $env:COMPOSE_PROFILES = $Profile
  try {
    & docker compose -f (Join-Path $script:Root 'compose.yaml') --project-directory $script:Root @ComposeArgs
    if ($LASTEXITCODE -ne 0) { Fail "docker compose $($ComposeArgs -join ' ') 失败" }
  }
  finally {
    if ($null -eq $previous) { Remove-Item Env:COMPOSE_PROFILES -ErrorAction SilentlyContinue }
    else { $env:COMPOSE_PROFILES = $previous }
  }
}

function Protect-EnvFile {
  param([string]$Path)
  if (-not (Test-WindowsHost)) { return }
  try {
    $acl = Get-Acl $Path
    $acl.SetAccessRuleProtection($true, $false)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, 'FullControl', 'Allow')
    $acl.ResetAccessRule($rule)
    Set-Acl $Path $acl
  }
  catch { Write-Warn '.env 权限未能收成仅当前用户可读' }
}

function Ensure-Env {
  $example = Join-Path $script:Root '.env.example'
  $envFile = Join-Path $script:Root '.env'
  if (-not (Test-Path $example)) { Fail '缺少 .env.example' }
  if (-not (Test-Path $envFile)) {
    if ($script:Dry) {
      Write-Info '会从 .env.example 创建 .env，并询问 PUBLIC_ORIGIN、所属人口令和入口'
      return
    }
    Copy-Item $example $envFile
    Protect-EnvFile $envFile
  }
  Pin-ImageFromRelease
  $origin = Read-EnvValue $envFile 'PUBLIC_ORIGIN'
  if (-not (Test-Origin $origin)) {
    if ($script:Dry) { Write-Info 'PUBLIC_ORIGIN 还是占位，正式运行前会询问' }
    elseif ($script:Yes) { Fail '非交互安装必须先准备好合法的 PUBLIC_ORIGIN' }
    else {
      Write-Tone '对外源  发现文档和批准地址只用它，不看请求 Host。' 'bold'
      do {
        $origin = Read-Host 'PUBLIC_ORIGIN [https://自己的域名]'
        $origin = $origin.Trim().TrimEnd('/')
        if (-not (Test-Origin $origin)) { Write-Warn '必须是 https://主机 或 https://主机:端口，不能带路径。' }
      } while (-not (Test-Origin $origin))
      Write-EnvValue $envFile 'PUBLIC_ORIGIN' $origin
    }
  }
  foreach ($key in @('POSTGRES_PASSWORD', 'RUSTFS_ACCESS_KEY', 'RUSTFS_SECRET_KEY')) {
    $current = Read-EnvValue $envFile $key
    if (Test-ExampleSecret $current) { continue }
    if (-not (Test-Secret $current)) {
      Fail "$key 已有值，但不能使用（不能是 password、secret，也不能含 `$ 或反引号）。不会改写 .env。"
    }
  }
  foreach ($key in @('POSTGRES_PASSWORD', 'RUSTFS_ACCESS_KEY', 'RUSTFS_SECRET_KEY')) {
    $current = Read-EnvValue $envFile $key
    if (-not (Test-ExampleSecret $current)) { continue }
    if ($script:Dry) { Write-Info "会为 $key 生成随机值，只写入 .env"; continue }
    Write-EnvValue $envFile $key (New-HexSecret)
    Write-Info "$key 已写入 .env，不在终端显示"
  }
  $owner = Read-EnvValue $envFile 'OWNER_PASSWORD'
  if (-not (Test-Secret $owner)) {
    if ($script:Dry) { Write-Info '所属人初始口令还是占位，正式运行前会询问' }
    elseif ($env:OWNER_PASSWORD -and (Test-Secret $env:OWNER_PASSWORD)) {
      Write-EnvValue $envFile 'OWNER_PASSWORD' $env:OWNER_PASSWORD
    }
    elseif ($script:Yes) { Fail 'OWNER_PASSWORD 还是占位。非交互时从环境变量传入一个不含 $ 的口令。' }
    else {
      do {
        $owner = Read-PlainSecret '所属人初始口令（不会回显，登录后仍要修改）'
        $again = Read-PlainSecret '再输入一次'
        if ($owner -ne $again) { Write-Warn '两次不一致'; continue }
        if (-not (Test-Secret $owner)) { Write-Warn '口令不能为空、不能是 change-me，也不能含 $ 或反引号。' }
      } while (-not (Test-Secret $owner) -or $owner -ne $again)
      Write-EnvValue $envFile 'OWNER_PASSWORD' $owner
    }
  }
  $profile = Read-EnvValue $envFile 'COMPOSE_PROFILES'
  if (-not (Test-Profile $profile)) {
    if ($script:Dry) { Write-Info '会询问唯一入口：cloudflared、caddy 或 tailscale'; return }
    if ($script:Yes) { $profile = 'cloudflared' }
    else {
      Write-Tone '入口  同一时间只能选一个。换入口不改应用镜像。' 'bold'
      Write-Host '  1  cloudflared   默认。不开放路由器端口'
      Write-Host '  2  caddy         自己的域名，80 和 443 必须能从公网到达'
      Write-Host '  3  tailscale     只有同一 tailnet。只做 Serve，不开 Funnel'
      $choice = Read-Host '选择 [1]'
      if (-not $choice) { $choice = '1' }
      if ($choice -eq '1' -or $choice -eq 'cloudflared') { $profile = 'cloudflared' }
      elseif ($choice -eq '2' -or $choice -eq 'caddy') { $profile = 'caddy' }
      elseif ($choice -eq '3' -or $choice -eq 'tailscale') { $profile = 'tailscale' }
      else { Fail '入口只能是 cloudflared、caddy 或 tailscale' }
    }
    Write-EnvValue $envFile 'COMPOSE_PROFILES' $profile
  }
  Set-ProfileSecret $envFile $profile
}

function Set-ProfileSecret {
  param([string]$EnvFile, [string]$Profile)
  if ($Profile -eq 'caddy') {
    $domain = Read-EnvValue $EnvFile 'APP_DOMAIN'
    $email = Read-EnvValue $EnvFile 'ACME_EMAIL'
    if (-not $domain) {
      if ($script:Dry) { Write-Info 'APP_DOMAIN 可以留空' }
      elseif (-not $script:Yes) {
        $domain = Read-Host 'APP_DOMAIN [和 PUBLIC_ORIGIN 的主机名一致]'
        if ($domain) { Write-EnvValue $EnvFile 'APP_DOMAIN' $domain.Trim() }
      }
      else { Write-Warn 'APP_DOMAIN 为空。入口容器可以失败，应用和数据库仍会留下。' }
    }
    if (-not $email) {
      if ($script:Dry) { Write-Info 'ACME_EMAIL 可以留空' }
      elseif (-not $script:Yes) {
        $email = Read-Host 'ACME_EMAIL'
        if ($email) { Write-EnvValue $EnvFile 'ACME_EMAIL' $email.Trim() }
      }
      else { Write-Warn 'ACME_EMAIL 为空。入口容器可以失败，应用和数据库仍会留下。' }
    }
    return
  }
  $key = ''
  $label = ''
  if ($Profile -eq 'cloudflared') {
    $key = 'TUNNEL_TOKEN'
    $label = 'Cloudflare Tunnel 令牌'
  }
  elseif ($Profile -eq 'tailscale') {
    $key = 'TAILSCALE_AUTHKEY'
    $label = 'Tailscale auth key'
  }
  else { return }
  $current = Read-EnvValue $EnvFile $key
  if ($current) { return }
  if ($script:Dry) {
    Write-Info '入口令牌可以留空。留空时入口容器可以失败，应用和数据库仍会留下。'
    return
  }
  if (-not $script:Yes) {
    $value = Read-PlainSecret "$label（可直接回车，入口以后再补）"
    if ($value) { Write-EnvValue $EnvFile $key $value }
  }
  else { Write-Warn "$label 为空。入口容器可以失败，应用和数据库仍会留下。" }
}

function Test-RefNewer {
  param([string]$Left, [string]$Right)
  if ($Left -notmatch '^v([0-9]+)\.([0-9]+)\.([0-9]+)(-([0-9A-Za-z.-]+))?$') { return $false }
  $lmaj = [int]$Matches[1]
  $lmin = [int]$Matches[2]
  $lpat = [int]$Matches[3]
  $lpre = ''
  if ($Matches[5]) { $lpre = [string]$Matches[5] }
  if ($Right -notmatch '^v([0-9]+)\.([0-9]+)\.([0-9]+)(-([0-9A-Za-z.-]+))?$') { return $false }
  $rmaj = [int]$Matches[1]
  $rmin = [int]$Matches[2]
  $rpat = [int]$Matches[3]
  $rpre = ''
  if ($Matches[5]) { $rpre = [string]$Matches[5] }
  if ($lmaj -ne $rmaj) { return ($lmaj -gt $rmaj) }
  if ($lmin -ne $rmin) { return ($lmin -gt $rmin) }
  if ($lpat -ne $rpat) { return ($lpat -gt $rpat) }
  if (-not $lpre -and $rpre) { return $true }
  if ($lpre -and -not $rpre) { return $false }
  if ($lpre -and $rpre -and $lpre -ne $rpre) {
    return ([string]::Compare($lpre, $rpre, [System.StringComparison]::Ordinal) -gt 0)
  }
  return $false
}

function Sync-BundleIfNeeded {
  $dev = Join-Path $script:Root 'compose.dev.yaml'
  $apps = Join-Path $script:Root 'apps/server'
  if ((Test-Path $dev) -and (Test-Path $apps)) { return }
  if (-not $env:ONESELF_REF) {
    if (-not $script:BundledRef) { return }
    $current = ''
    $release = Join-Path $script:Root '.oneself-release'
    if (Test-Path $release) { $current = Read-EnvValue $release 'ref' }
    if (Test-RefNewer $current $script:BundledRef) {
      Write-Warn "已安装 $current，比这份脚本的 $($script:BundledRef) 新。不往回同步。"
      return
    }
  }
  if (-not $script:BundledRef -and -not $env:ONESELF_REF) { return }
  Resolve-Ref
  $current = ''
  $release = Join-Path $script:Root '.oneself-release'
  if (Test-Path $release) { $current = Read-EnvValue $release 'ref' }
  if ($current -eq $script:ResolvedRef) { return }
  Write-Info "安装文件从 $current 换到 $($script:ResolvedRef)。不覆盖 .env。"
  if ($script:Dry) { return }
  Install-Bundle $script:Root $script:ResolvedRef
}

function Ensure-Files {
  if (-not $script:Root) { $script:Root = Resolve-TargetDir }
  if (-not $script:Announced) {
    Show-InstallDir
    $script:Announced = $true
  }
  $compose = Join-Path $script:Root 'compose.yaml'
  $caddy = Join-Path $script:Root 'deploy/Caddyfile'
  if ((Test-Path $compose) -and (Test-Path $caddy)) {
    Sync-BundleIfNeeded
    return
  }
  if ($script:Dry) {
    Resolve-Ref
    Write-Info "会下载 $($script:ResolvedRef) 的 compose.yaml、.env.example、deploy/Caddyfile"
    return
  }
  New-Item -ItemType Directory -Force -Path $script:Root | Out-Null
  Resolve-Ref
  Install-Bundle $script:Root $script:ResolvedRef
  if (-not (Test-Path (Join-Path $script:Root 'compose.yaml'))) { Fail '安装包里没有 compose.yaml' }
}

function Pin-ImageFromRelease {
  $envFile = Join-Path $script:Root '.env'
  $release = Join-Path $script:Root '.oneself-release'
  if (-not (Test-Path -LiteralPath $envFile)) { return }
  if (-not (Test-Path -LiteralPath $release)) { return }
  $tag = Read-EnvValue $release 'ref'
  if (-not $tag) { return }
  $image = $null
  if ($tag -eq 'latest') { $image = "$($script:ImageRepo):latest" }
  elseif ($tag -match '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$') {
    $image = "$($script:ImageRepo):$($tag.Substring(1))"
  }
  else { return }
  $current = Read-EnvValue $envFile 'ONESELF_IMAGE'
  $managed = $false
  if (-not $current) { $managed = $true }
  elseif ($current -like 'docker.io/ptonlix/oneself:*') { $managed = $true }
  elseif ($current -like "$($script:ImageRepo):*") { $managed = $true }
  if (-not $managed) { return }
  if ($current -eq $image) { return }
  if ($script:Dry) {
    Write-Info "会把 ONESELF_IMAGE 定为 $image"
    return
  }
  Write-EnvValue $envFile 'ONESELF_IMAGE' $image
  Write-Info "镜像标签定为 $image"
}

function Stop-OtherIngress {
  param([string]$Profile)
  foreach ($name in @('cloudflared', 'caddy', 'tailscale')) {
    if ($name -eq $Profile) { continue }
    if ($script:Dry) {
      Write-Info "会停止另一个入口 $name"
      continue
    }
    $previous = $env:COMPOSE_PROFILES
    $env:COMPOSE_PROFILES = $name
    try {
      & docker compose -f (Join-Path $script:Root 'compose.yaml') --project-directory $script:Root stop $name 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) { Write-Warn "没能停止 $name。如果它仍在跑，doctor 会标出来。" }
    }
    catch { Write-Warn "没能停止 $name。如果它仍在跑，doctor 会标出来。" }
    finally {
      if ($null -eq $previous) { Remove-Item Env:COMPOSE_PROFILES -ErrorAction SilentlyContinue }
      else { $env:COMPOSE_PROFILES = $previous }
    }
  }
}

function Invoke-Install {
  Show-Mark
  if (-not $script:Root) { $script:Root = Resolve-TargetDir }
  Show-InstallDir
  $script:Announced = $true
  Assert-Compose
  Ensure-Files
  if ($script:Dry -and -not (Test-Path (Join-Path $script:Root 'compose.yaml'))) {
    Write-Info 'dry-run：不会创建目录，也不会启动容器'
    return
  }
  $dev = Join-Path $script:Root 'compose.dev.yaml'
  $apps = Join-Path $script:Root 'apps/server'
  if ((Test-Path $dev) -and (Test-Path $apps) -and $env:ONESELF_IN_REPO -ne '1') {
    Fail '这是源码目录。生产安装不会装进源码树。设置 ONESELF_IN_REPO=1 才会继续。'
  }
  Ensure-Env
  if ($script:Dry -and -not (Test-Path (Join-Path $script:Root '.env'))) { return }
  $envFile = Join-Path $script:Root '.env'
  $profile = Read-EnvValue $envFile 'COMPOSE_PROFILES'
  if (-not (Test-Profile $profile)) { Fail 'COMPOSE_PROFILES 必须恰好是 cloudflared、caddy、tailscale 之一' }
  $origin = Read-EnvValue $envFile 'PUBLIC_ORIGIN'
  $image = Read-EnvValue $envFile 'ONESELF_IMAGE'
  Write-Host ''
  Write-Info "目录    $($script:Root)"
  Write-Info "入口    $profile"
  Write-Info "对外源  $origin"
  Write-Info "镜像    $image"
  Stop-OtherIngress $profile
  if ($script:Dry) {
    Write-Info 'dry-run：不会执行 docker compose'
    return
  }
  if ($image -like '*:local') { Invoke-Compose $profile @('up', '-d', '--build') }
  else {
    Write-Info '拉取镜像并启动。数据库和对象存储不映射宿主机端口。'
    Invoke-Compose $profile @('pull')
    Invoke-Compose $profile @('up', '-d')
  }
  Write-Host ''
  Write-Ok '栈已提交给 Compose。迁移在应用监听前完成，失败则不会监听。'
  Write-Host "   管理端   $origin/admin"
  Write-Host "   发现文档 $origin/.well-known/pcp"
  Write-Host "   接 Agent npx skills add $origin -a <agent> -s oneself -y"
  $local = Join-Path $script:Root 'oneself.ps1'
  $bundled = Join-Path $script:Root 'deploy/oneself.ps1'
  if (Test-Path -LiteralPath $bundled) { Copy-Item -LiteralPath $bundled -Destination $local -Force }
  Write-Host "   以后更新 powershell -ExecutionPolicy Bypass -File `"$local`" update"
}

function Invoke-Update {
  Show-Mark
  if (-not $script:Root) { $script:Root = Resolve-TargetDir }
  Show-InstallDir
  $script:Announced = $true
  Assert-Compose
  Ensure-Files
  $envFile = Join-Path $script:Root '.env'
  if (-not (Test-Path $envFile)) { Fail '没有 .env。先运行安装。' }
  Pin-ImageFromRelease
  $profile = Read-EnvValue $envFile 'COMPOSE_PROFILES'
  if (-not (Test-Profile $profile)) { Fail 'COMPOSE_PROFILES 必须恰好是一个入口' }
  Stop-OtherIngress $profile
  if ($script:Dry) { Write-Info "dry-run：会在 $($script:Root) 执行 docker compose pull && up -d"; return }
  Invoke-Compose $profile @('pull')
  Invoke-Compose $profile @('up', '-d')
  Write-Ok '已按当前 .env 的镜像更新。换版本请重新取对应 Release 的 oneself.ps1。'
}

function Get-RunningServiceNames {
  param([string]$Profile)
  $previous = $env:COMPOSE_PROFILES
  $env:COMPOSE_PROFILES = $Profile
  $names = @()
  try {
    $names = @( & docker compose -f (Join-Path $script:Root 'compose.yaml') --project-directory $script:Root ps --status running --format '{{.Service}}' )
    if ($LASTEXITCODE -ne 0) { return @() }
  }
  catch { return @() }
  finally {
    if ($null -eq $previous) { Remove-Item Env:COMPOSE_PROFILES -ErrorAction SilentlyContinue }
    else { $env:COMPOSE_PROFILES = $previous }
  }
  return $names
}

function Invoke-Doctor {
  Show-Mark
  if (-not $script:Root) { $script:Root = Resolve-TargetDir }
  Show-InstallDir
  $script:Announced = $true
  $fails = 0
  $compose = Join-Path $script:Root 'compose.yaml'
  if (-not (Test-Path -LiteralPath $compose)) {
    Write-Tone '✗ 找不到 compose.yaml。doctor 不会下载，也不会创建目录。' 'rose'
    $fails++
  }
  $envFile = Join-Path $script:Root '.env'
  if (-not (Test-Path -LiteralPath $envFile)) {
    Write-Tone "✗ 没有 .env。安装目录是 $($script:Root)" 'rose'
    $fails++
  }
  $profile = ''
  if (Test-Path -LiteralPath $envFile) {
    $profile = Read-EnvValue $envFile 'COMPOSE_PROFILES'
    if (Test-Profile $profile) { Write-Ok "入口只有 $profile" } else { Write-Tone "✗ COMPOSE_PROFILES=$profile" 'rose'; $fails++ }
    $origin = Read-EnvValue $envFile 'PUBLIC_ORIGIN'
    if (Test-Origin $origin) { Write-Ok "PUBLIC_ORIGIN $origin" } else { Write-Tone '✗ PUBLIC_ORIGIN 不合法或仍是占位' 'rose'; $fails++ }
    foreach ($key in @('OWNER_PASSWORD', 'POSTGRES_PASSWORD', 'RUSTFS_ACCESS_KEY', 'RUSTFS_SECRET_KEY')) {
      if (Test-Secret (Read-EnvValue $envFile $key)) { Write-Ok "$key 已设置" }
      else { Write-Tone "✗ $key 仍是占位、为空，或含 `$" 'rose'; $fails++ }
    }
  }
  $docker = Get-Command docker -ErrorAction SilentlyContinue
  if ($docker -and (Test-Path -LiteralPath $compose)) {
    & docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
      $queryProfile = $profile
      if (-not (Test-Profile $queryProfile)) { $queryProfile = 'cloudflared' }
      $services = @(Get-RunningServiceNames $queryProfile)
      $ingresses = 0
      foreach ($name in @('cloudflared', 'caddy', 'tailscale')) {
        if ($services -contains $name) { $ingresses++ }
      }
      if ($ingresses -gt 1) { Write-Tone "✗ 有 $ingresses 个入口容器在跑" 'rose'; $fails++ }
      elseif ($ingresses -eq 1) { Write-Ok '正在跑的入口不超过一个' }
      else { Write-Warn '入口容器没在跑。没有令牌时这是允许的。' }
      if ($services -contains 'postgres') {
        $published = ''
        $previous = $env:COMPOSE_PROFILES
        $env:COMPOSE_PROFILES = $queryProfile
        try {
          $published = & docker compose -f $compose --project-directory $script:Root port postgres 5432 2>$null
        }
        catch { $published = '' }
        finally {
          if ($null -eq $previous) { Remove-Item Env:COMPOSE_PROFILES -ErrorAction SilentlyContinue }
          else { $env:COMPOSE_PROFILES = $previous }
        }
        if ($LASTEXITCODE -eq 0 -and $published) {
          Write-Tone "✗ PostgreSQL 映射到了宿主机：$published" 'rose'
          $fails++
        }
        else { Write-Ok 'PostgreSQL 没有宿主机端口' }
      }
    }
  }
  if ($fails -gt 0) { Fail "doctor 有 $fails 项失败" }
  Write-Ok '检查通过'
}

function Invoke-SelfTest {
  if (-not (Test-Origin 'https://oneself.example.com')) { Fail 'origin https' }
  if (Test-Origin 'https://example.invalid') { Fail 'origin placeholder' }
  if (Test-Origin 'http://oneself.example.com') { Fail 'origin http' }
  if (Test-Origin 'https://oneself.example.com/pcp') { Fail 'origin path' }
  if (Test-Origin 'https://localhost') { Fail 'origin localhost' }
  if (Test-Origin 'https://127.0.0.1') { Fail 'origin loopback' }
  if (Test-Origin 'https://127.0.0.1:443') { Fail 'origin loopback port' }
  if (-not (Test-Secret 'correct-horse-battery')) { Fail 'secret ok' }
  if (Test-Secret 'change-me') { Fail 'secret placeholder' }
  if (Test-Secret 'has$dollar') { Fail 'secret dollar' }
  if (Test-ExampleSecret 'change-me') { } else { Fail 'example secret' }
  if (Test-ExampleSecret 'password') { Fail 'password is not an example placeholder' }
  if (-not (Test-RefNewer 'v1.2.4' 'v1.2.3')) { Fail 'ref newer' }
  if (Test-RefNewer 'v1.2.3' 'v1.2.4') { Fail 'ref older' }
  if (-not (Test-RefNewer 'v1.2.3' 'v1.2.3-rc.1')) { Fail 'release newer than prerelease' }
  $dir = Get-DefaultDir
  if ($dir -notmatch 'oneself$') { Fail "default dir $dir" }
  if (Test-WindowsHost -and $dir -notmatch 'AppData\\Local\\oneself$') { Fail "windows dir $dir" }
  Write-Host 'self-test ok'
}

function Invoke-OneSelfInstaller {
  param([string[]]$UserArgs)
  $i = 0
  while ($i -lt $UserArgs.Count) {
    $item = $UserArgs[$i]
    if ($item -eq '--dry-run' -or $item -eq '-DryRun') { $script:Dry = $true }
    elseif ($item -eq '--yes' -or $item -eq '-Yes' -or $item -eq '-y') { $script:Yes = $true }
    elseif ($item -eq '--self-test' -or $item -eq '-SelfTest') { $script:Command = 'self-test' }
    elseif ($item -eq '-Dir') { Fail '不要用 -Dir。换目录用 --dir 或 ONESELF_DIR。' }
    elseif ($item -eq '--dir') {
      $i++
      if ($i -ge $UserArgs.Count) { Fail '--dir 需要一个目录' }
      $env:ONESELF_DIR = $UserArgs[$i]
    }
    elseif ($item -eq 'install' -or $item -eq 'update' -or $item -eq 'doctor' -or $item -eq 'help') {
      $script:Command = $item
    }
    else { Fail "无法识别 $item" }
    $i++
  }
  if ($script:Command -eq 'install' -and $env:ONESELF_COMMAND) { $script:Command = $env:ONESELF_COMMAND }
  if ($env:ONESELF_DRY_RUN -eq '1') { $script:Dry = $true }
  if ($script:Command -eq 'help') {
    Show-Mark
    Write-Host 'powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"'
    Write-Host '默认目录是 %LOCALAPPDATA%\oneself。执行时会先打印。'
    Write-Host 'update / doctor：powershell -ExecutionPolicy Bypass -File <安装目录>\oneself.ps1 update'
    Write-Host '换目录只用 --dir <目录> 或 ONESELF_DIR。'
    Write-Host '--dir 不改变 Compose 项目名 oneself，第二个目录会接到同一组卷。'
    return
  }
  if ($script:Command -eq 'self-test') { Invoke-SelfTest; return }
  if ($script:Command -eq 'update') { Invoke-Update; return }
  if ($script:Command -eq 'doctor') { Invoke-Doctor; return }
  if ($script:Command -eq 'install') { Invoke-Install; return }
  Fail "无法识别 $($script:Command)"
}

if ($env:ONESELF_PS1_LIBRARY -ne '1') {
  Invoke-OneSelfInstaller -UserArgs @($args)
}
