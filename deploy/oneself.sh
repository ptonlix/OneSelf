#!/bin/sh
# OneSelf 宿主安装脚本。只调用 Docker Compose，不起第二套部署。
# 不安装入口程序，不映射数据库端口，不从主机名推断 PUBLIC_ORIGIN。
# Agent 接入不在这里：npx skills add https://站点 -a <agent> -s oneself
#
# 仓库里：./deploy/oneself.sh
# 发布附件：curl -fsSL https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.sh | sh
# Windows：powershell -c "irm https://github.com/ptonlix/OneSelf/releases/latest/download/oneself.ps1 | iex"
#
# 发布工作流会把下一行改成具体标签。仓库副本保持为空，因此只使用旁边的 compose.yaml。
ONESELF_BUNDLED_REF=${ONESELF_BUNDLED_REF:-}

set -eu

ONESELF_REPO="${ONESELF_REPO:-ptonlix/OneSelf}"
ONESELF_IMAGE_REPO="${ONESELF_IMAGE_REPO:-docker.io/ptonlix/oneself}"

CMD=install
DRY=0
YES=0
ROOT=
DIR_SOURCE=default
RESOLVED_REF=
TEAL= BLUE= VIOLET= LILAC= AMBER= ROSE= DIM= BOLD= RESET= INK=

usage() {
  cat <<'EOF'
oneself.sh                 安装或再次拉起。目录用下面的默认值
oneself.sh update          按 .env 里的镜像拉取并重启
oneself.sh doctor          只检查，不改配置，不重启
oneself.sh backup          转给仓库里的传输脚本
oneself.sh restore         同上，用于导入
oneself.sh help

  --dir <目录>          不用默认目录
  --yes, -y             不再询问已经能确定的问题
  --dry-run             只打印会做什么
  --self-test           跑不碰 Docker 的自检

默认目录：Unix 是 ${XDG_DATA_HOME:-$HOME/.local/share}/oneself。
Windows 的 Git Bash 是 %LOCALAPPDATA%\oneself，即 C:\Users\<用户名>\AppData\Local\oneself。
WSL 仍用 Linux 家目录，不放到 /mnt/c。执行时会先打印实际路径。
环境变量：ONESELF_DIR、ONESELF_REF、ONESELF_YES=1、ONESELF_PLAIN=1、ONESELF_ALLOW_HTTP=1
--dir 不改变 Compose 项目名 oneself，第二个目录会接到同一组卷。
EOF
}

die() {
  printf '  %s✗%s  %s\n' "$ROSE" "$RESET" "$*" >&2
  exit 1
}

warn() {
  printf '  %s!%s  %s\n' "$AMBER" "$RESET" "$*" >&2
}

ok() {
  printf '  %s●%s  %s\n' "$TEAL" "$RESET" "$*"
}

info() {
  printf '  %s│%s  %s%s%s\n' "$BLUE" "$RESET" "$DIM" "$*" "$RESET"
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少 $1"
}

setup_colors() {
  if [ -n "${NO_COLOR:-}" ] || [ "${ONESELF_PLAIN:-}" = 1 ] || [ ! -t 1 ]; then
    return 0
  fi
  TEAL=$(printf '\033[38;2;45;212;191m')
  BLUE=$(printf '\033[38;2;109;139;248m')
  VIOLET=$(printf '\033[38;2;168;85;247m')
  LILAC=$(printf '\033[38;2;196;181;253m')
  AMBER=$(printf '\033[38;2;245;199;126m')
  ROSE=$(printf '\033[38;2;251;125;150m')
  INK=$(printf '\033[38;2;167;171;198m')
  DIM=$(printf '\033[2m')
  BOLD=$(printf '\033[1m')
  RESET=$(printf '\033[0m')
}

tty_ready() {
  ( : <>/dev/tty ) 2>/dev/null
}

mark_ring() {
  case "$1,$2" in
    1,3 | 1,4 | 1,5 | 2,2 | 2,3 | 2,4 | 2,5 | 2,6 | 3,1 | 3,2 | 3,6 | 3,7 | 4,1 | 4,2 | 4,6 | 4,7 | 5,1 | 5,2 | 5,6 | 5,7 | 6,2 | 6,3 | 6,4 | 6,5 | 6,6 | 7,3 | 7,4 | 7,5) return 0 ;;
    *) return 1 ;;
  esac
}

mark_sat() {
  case "$1" in
    0) SAT_R=0; SAT_C=4 ;;
    1) SAT_R=0; SAT_C=6 ;;
    2) SAT_R=2; SAT_C=8 ;;
    3) SAT_R=4; SAT_C=8 ;;
    4) SAT_R=6; SAT_C=8 ;;
    5) SAT_R=8; SAT_C=6 ;;
    6) SAT_R=8; SAT_C=4 ;;
    7) SAT_R=8; SAT_C=2 ;;
    8) SAT_R=6; SAT_C=0 ;;
    9) SAT_R=4; SAT_C=0 ;;
    10) SAT_R=2; SAT_C=0 ;;
    11) SAT_R=0; SAT_C=2 ;;
    *) SAT_R=-1; SAT_C=-1 ;;
  esac
}

mark_paint() {
  cell_row=$1
  cell_col=$2
  cell_phase=$3
  sat_i=-1
  if [ "$cell_phase" -eq 99 ]; then
    sat_i=1
  elif [ "$cell_phase" -ge 8 ] && [ "$cell_phase" -le 19 ]; then
    sat_i=$((cell_phase - 8))
  fi
  if [ "$sat_i" -ge 0 ]; then
    mark_sat "$sat_i"
    if [ "$cell_row" -eq "$SAT_R" ] && [ "$cell_col" -eq "$SAT_C" ]; then
      printf '%s%s██%s' "$BOLD" "$VIOLET" "$RESET"
      return 0
    fi
    if [ "$cell_phase" -ne 99 ]; then
      trail_i=$((sat_i - 1))
      [ "$trail_i" -lt 0 ] && trail_i=11
      mark_sat "$trail_i"
      if [ "$cell_row" -eq "$SAT_R" ] && [ "$cell_col" -eq "$SAT_C" ]; then
        printf '%s░░%s' "$LILAC" "$RESET"
        return 0
      fi
    fi
  fi
  if [ "$cell_row" -eq 4 ] && [ "$cell_col" -eq 4 ]; then
    if [ "$cell_phase" -eq 7 ]; then
      printf '%s%s██%s' "$BOLD" "$LILAC" "$RESET"
      return 0
    fi
    if [ "$cell_phase" -ge 8 ] || [ "$cell_phase" -eq 99 ]; then
      printf '%s%s██%s' "$BOLD" "$BLUE" "$RESET"
      return 0
    fi
  fi
  if mark_ring "$cell_row" "$cell_col"; then
    if [ "$cell_phase" -eq 99 ] || [ "$cell_phase" -ge 7 ] || [ "$cell_row" -le $((cell_phase + 1)) ]; then
      case "$cell_row" in
        1 | 2) printf '%s██%s' "$TEAL" "$RESET" ;;
        3 | 4) printf '%s██%s' "$BLUE" "$RESET" ;;
        *) printf '%s██%s' "$VIOLET" "$RESET" ;;
      esac
      return 0
    fi
  fi
  printf '  '
}

draw_scene() {
  scene_phase=$1
  scene_row=0
  printf '\n'
  while [ "$scene_row" -lt 9 ]; do
    printf '    '
    scene_col=0
    while [ "$scene_col" -lt 9 ]; do
      mark_paint "$scene_row" "$scene_col" "$scene_phase"
      scene_col=$((scene_col + 1))
    done
    printf '\n'
    scene_row=$((scene_row + 1))
  done
  printf '\n'
  if [ "$scene_phase" -ge 12 ] || [ "$scene_phase" -eq 99 ]; then
    printf '    %s%sO%s%sN%s%sE%s%sS%s%sE%s%sL%s%sF%s\n' \
      "$BOLD" "$TEAL" "$RESET" "$TEAL" "$RESET" "$BLUE" "$RESET" "$BLUE" "$RESET" \
      "$VIOLET" "$RESET" "$VIOLET" "$RESET" "$LILAC" "$RESET"
    printf '    %sone context. every agent.%s\n' "$INK" "$RESET"
    printf '    %s建立一份关于你的上下文，让每个 AI 都了解你，在隐私与效率之间取得平衡%s\n' "$DIM" "$RESET"
  else
    printf '\n\n\n'
  fi
}

show_banner() {
  animate=$1
  if [ "$animate" != 1 ] || [ ! -t 1 ] || [ "${ONESELF_PLAIN:-}" = 1 ]; then
    draw_scene 99
    printf '\n'
    return 0
  fi
  esc=$(printf '\033')
  hide="${esc}[?25l"
  BANNER_SHOW="${esc}[?25h"
  show="$BANNER_SHOW"
  trap 'printf "%s%s\n" "${RESET}" "$show"; trap - INT TERM; exit 130' INT TERM
  printf '%s%s%s' "$hide" "${esc}[2J" "${esc}[H"
  animate_banner "$esc" || {
    printf '%s%s' "$RESET" "$show"
    trap - INT TERM
    exit 1
  }
  printf '%s%s' "$RESET" "$show"
  trap - INT TERM
  printf '\n'
}

animate_banner() {
  esc=$1
  scene_i=0
  while [ "$scene_i" -le 19 ]; do
    printf '%s' "${esc}[H"
    draw_scene "$scene_i"
    scene_i=$((scene_i + 1))
    sleep 0.045
  done
  sleep 0.12
}

profile_ok() {
  case "$1" in
    cloudflared | caddy | tailscale) return 0 ;;
    *) return 1 ;;
  esac
}

origin_ok() {
  origin=$1
  case "$origin" in
    https://*) ;;
    http://*) [ "${ONESELF_ALLOW_HTTP:-}" = 1 ] || return 1 ;;
    *) return 1 ;;
  esac
  rest=${origin#*://}
  case "$rest" in
    "" | */* | *\\* | *" "* | *"	"* | *\?* | *\#*) return 1 ;;
  esac
  case "$rest" in
    example.invalid | *.example.invalid | localhost | 127.0.0.1 | 127.0.0.1:*) return 1 ;;
  esac
  case "$rest" in
    *[!A-Za-z0-9._:-]*) return 1 ;;
  esac
  host=${rest%%:*}
  case "$host" in
    "" | .* | *. | *..*) return 1 ;;
  esac
  return 0
}

origin_host() {
  rest=${1#*://}
  printf '%s' "${rest%%:*}"
}

ref_ok() {
  case "$1" in
    latest) return 0 ;;
  esac
  body=$1
  case "$body" in
    v*) body=${body#v} ;;
    *) return 1 ;;
  esac
  pre=
  had_pre=0
  case "$body" in
    *-*)
      had_pre=1
      pre=${body#*-}
      body=${body%%-*}
      ;;
  esac
  case "$body" in
    *.*.*) ;;
    *) return 1 ;;
  esac
  major=${body%%.*}
  rest=${body#*.}
  minor=${rest%%.*}
  patch=${rest#*.}
  case "$patch" in
    *.*) return 1 ;;
  esac
  [ -n "$major" ] && [ -n "$minor" ] && [ -n "$patch" ] || return 1
  case "$major" in *[!0-9]*) return 1 ;; esac
  case "$minor" in *[!0-9]*) return 1 ;; esac
  case "$patch" in *[!0-9]*) return 1 ;; esac
  if [ "$had_pre" = 1 ]; then
    [ -n "$pre" ] || return 1
    case "$pre" in
      *[!0-9A-Za-z.-]*) return 1 ;;
    esac
  fi
  return 0
}

split_ref() {
  REF_MAJ=
  REF_MIN=
  REF_PAT=
  REF_PRE=
  ref_ok "$1" || return 1
  [ "$1" = latest ] && return 1
  body=${1#v}
  case "$body" in
    *-*)
      REF_PRE=${body#*-}
      body=${body%%-*}
      ;;
  esac
  REF_MAJ=${body%%.*}
  rest=${body#*.}
  REF_MIN=${rest%%.*}
  REF_PAT=${rest#*.}
  return 0
}

# 0 when $1 is a strictly newer version tag than $2. latest is not comparable.
ref_newer() {
  split_ref "$1" || return 1
  left_maj=$REF_MAJ
  left_min=$REF_MIN
  left_pat=$REF_PAT
  left_pre=$REF_PRE
  split_ref "$2" || return 1
  [ "$left_maj" -gt "$REF_MAJ" ] && return 0
  [ "$left_maj" -lt "$REF_MAJ" ] && return 1
  [ "$left_min" -gt "$REF_MIN" ] && return 0
  [ "$left_min" -lt "$REF_MIN" ] && return 1
  [ "$left_pat" -gt "$REF_PAT" ] && return 0
  [ "$left_pat" -lt "$REF_PAT" ] && return 1
  if [ -z "$left_pre" ] && [ -n "$REF_PRE" ]; then
    return 0
  fi
  if [ -n "$left_pre" ] && [ -z "$REF_PRE" ]; then
    return 1
  fi
  if [ -n "$left_pre" ] && [ "$left_pre" != "$REF_PRE" ]; then
    newer=$(printf '%s\n%s\n' "$left_pre" "$REF_PRE" | LC_ALL=C sort | tail -n 1)
    [ "$newer" = "$left_pre" ]
    return $?
  fi
  return 1
}

image_for_ref() {
  ref=$1
  ref_ok "$ref" || return 1
  if [ "$ref" = latest ]; then
    printf '%s:latest\n' "$ONESELF_IMAGE_REPO"
    return 0
  fi
  printf '%s:%s\n' "$ONESELF_IMAGE_REPO" "${ref#v}"
}

secret_ok() {
  case "$1" in
    "" | change-me | changeme | password | secret) return 1 ;;
  esac
  case "$1" in
    *\$* | *\`* | *"
"*) return 1 ;;
  esac
  return 0
}

read_env() {
  key=$1
  file=$2
  [ -f "$file" ] || return 0
  awk -v k="$key" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      line=$0
      sub(/\r$/, "", line)
      eq = index(line, "=")
      if (eq == 0) next
      name=substr(line, 1, eq - 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
      if (name != k) next
      val=substr(line, eq + 1)
      found=val
    }
    END {
      if (found == "") exit
      if (found ~ /^".*"$/) {
        found=substr(found, 2, length(found) - 2)
        gsub(/\\"/, "\"", found)
      } else if (found ~ /^'\''.*'\''$/) {
        found=substr(found, 2, length(found) - 2)
      }
      printf "%s", found
    }
  ' "$file"
}

write_env_value() {
  key=$1
  value=$2
  file=$3
  case "$value" in
    *"
"*) die "$key 不能含换行" ;;
  esac
  env_tmp=${file}.tmp
  # awk -v 会把 \t 当成制表符。密钥从 ENVIRON 传入，反斜杠保持字面。
  ONESELF_ENV_KEY=$key ONESELF_ENV_VALUE="$value" awk '
    BEGIN { found=0; k=ENVIRON["ONESELF_ENV_KEY"]; v=ENVIRON["ONESELF_ENV_VALUE"] }
    {
      line=$0
      sub(/\r$/, "", line)
      eq = index(line, "=")
      if (eq > 0) {
        name=substr(line, 1, eq - 1)
        gsub(/^[[:space:]]+|[[:space:]]+$/, "", name)
        if (name == k) {
          if (found == 0) print k "=" v
          found=1
          next
        }
      }
      print line
    }
    END { if (found == 0) print k "=" v }
  ' "$file" >"$env_tmp"
  mv "$env_tmp" "$file"
  chmod 600 "$file"
}

honor_yes() {
  if [ "${ONESELF_YES:-}" = 1 ]; then
    YES=1
  fi
}

confirm_no() {
  prompt=$1
  if [ "$YES" = 1 ]; then
    return 1
  fi
  tty_ready || return 1
  printf '%s [y/N] ' "$prompt" >/dev/tty
  IFS= read -r answer </dev/tty || answer=n
  case "$answer" in
    y | Y | yes | YES) return 0 ;;
    *) return 1 ;;
  esac
}

read_secret() {
  prompt=$1
  tty_ready || return 1
  printf '%s' "$prompt" >/dev/tty
  trap 'stty echo </dev/tty 2>/dev/null || true; printf "\n" >/dev/tty' INT TERM
  stty -echo </dev/tty
  IFS= read -r secret </dev/tty || secret=
  stty echo </dev/tty
  printf '\n' >/dev/tty
  trap - INT TERM
  printf '%s' "$secret"
}

ask_line() {
  prompt=$1
  fallback=$2
  if ! tty_ready; then
    printf '%s' "$fallback"
    return 0
  fi
  printf '%s' "$prompt" >/dev/tty
  IFS= read -r answer </dev/tty || answer=
  if [ -z "$answer" ]; then
    printf '%s' "$fallback"
  else
    printf '%s' "$answer"
  fi
}

take_flag() {
  case "$1" in
    --dry-run)
      DRY=1
      return 0
      ;;
    --yes | -y)
      YES=1
      return 0
      ;;
    --help | -h | help)
      CMD=help
      return 0
      ;;
    --self-test | self-test)
      CMD=self-test
      return 0
      ;;
    install | update | doctor | backup | restore)
      CMD=$1
      return 0
      ;;
    *) return 1 ;;
  esac
}

script_dir() {
  case "$0" in
    sh | */sh | bash | */bash | -) return 1 ;;
  esac
  [ -f "$0" ] || return 1
  cd -- "$(dirname -- "$0")" && pwd
}

expand_dir() {
  raw=$1
  case "$raw" in
    "" | . | .. | */) die "安装目录不能为空、不能是 . 或 ..、也不能以 / 结尾" ;;
  esac
  case "$raw" in
    \~) raw=$HOME ;;
    \~/*) raw=$HOME/${raw#\~/} ;;
  esac
  case "$raw" in
    /*) ;;
    *) raw=$PWD/$raw ;;
  esac
  parent=$(dirname -- "$raw")
  base=$(basename -- "$raw")
  [ "$base" != / ] && [ -n "$base" ] || die "安装目录不合法：$1"
  if [ -d "$parent" ]; then
    parent=$(cd -- "$parent" && pwd)
  fi
  printf '%s/%s' "$parent" "$base"
}

windows_shell() {
  case "$(uname -s 2>/dev/null)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

to_shell_path() {
  raw=$1
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -u "$raw"
    return 0
  fi
  case "$raw" in
    [A-Za-z]:\\* | [A-Za-z]:/*)
      drive=$(printf '%s' "$raw" | cut -c 1 | tr '[:upper:]' '[:lower:]')
      rest=$(printf '%s' "$raw" | cut -c 3- | tr '\\' '/')
      printf '/%s%s' "$drive" "$rest"
      ;;
    *) printf '%s' "$raw" ;;
  esac
}

to_windows_path() {
  raw=$1
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$raw"
    return 0
  fi
  case "$raw" in
    /[a-zA-Z]/*)
      drive=$(printf '%s' "$raw" | cut -c 2 | tr '[:lower:]' '[:upper:]')
      rest=$(printf '%s' "$raw" | cut -c 3- | tr '/' '\\')
      printf '%s:%s' "$drive" "$rest"
      ;;
    *) printf '%s' "$raw" ;;
  esac
}

default_install_dir() {
  if windows_shell; then
    if [ -n "${LOCALAPPDATA:-}" ]; then
      base=$(to_shell_path "$LOCALAPPDATA")
    elif [ -n "${USERPROFILE:-}" ]; then
      base=$(to_shell_path "$USERPROFILE")/AppData/Local
    else
      die "Windows 上找不到 LOCALAPPDATA 或 USERPROFILE"
    fi
    printf '%s/oneself' "$base"
    return 0
  fi
  base=${XDG_DATA_HOME:-$HOME/.local/share}
  case "$base" in
    /*) ;;
    *) die "XDG_DATA_HOME 必须是绝对路径" ;;
  esac
  printf '%s/oneself' "$base"
}

resolve_target_dir() {
  if [ -n "${ONESELF_DIR:-}" ]; then
    DIR_SOURCE=explicit
    expand_dir "$ONESELF_DIR"
    return 0
  fi
  if dir=$(script_dir 2>/dev/null); then
    if [ -f "$dir/compose.yaml" ] && [ -f "$dir/deploy/Caddyfile" ] && ! is_source_checkout "$dir"; then
      DIR_SOURCE=installed
      printf '%s' "$dir"
      return 0
    fi
    if [ -f "$dir/../compose.yaml" ] && [ -f "$dir/Caddyfile" ]; then
      parent=$(cd -- "$dir/.." && pwd)
      if ! is_source_checkout "$parent"; then
        DIR_SOURCE=installed
        printf '%s' "$parent"
        return 0
      fi
    fi
  fi
  DIR_SOURCE=default
  expand_dir "$(default_install_dir)"
}

choose_install_dir() {
  [ -n "$ROOT" ] && return 0
  ROOT=$(resolve_target_dir) || die "无法确定安装目录"
}

announce_install_dir() {
  printf '\n  %sdir%s    %s%s%s\n' "$DIM" "$RESET" "$TEAL" "$ROOT" "$RESET"
  case "$DIR_SOURCE" in
    explicit) printf '  %snote%s   这是你指定的目录\n' "$DIM" "$RESET" ;;
    installed) printf '  %snote%s   沿用这一份已经装好的目录\n' "$DIM" "$RESET" ;;
    *) printf '  %snote%s   默认目录 · 换地方用 %s--dir%s\n' "$DIM" "$RESET" "$INK" "$RESET" ;;
  esac
  if windows_shell; then
    printf '  %swin%s    %s\n' "$DIM" "$RESET" "$(to_windows_path "$ROOT")"
  fi
}

is_source_checkout() {
  [ -f "$1/compose.dev.yaml" ] && [ -d "$1/apps/server" ]
}

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

download() {
  url=$1
  dest=$2
  curl -fsSL --retry 3 --retry-delay 1 "$url" -o "$dest" 2>/dev/null
}

curl_to() {
  CURL_URL=$1
  CURL_DEST=$2
  http_file=$(mktemp)
  CURL_STATUS=0
  curl -fsSL --retry 3 --retry-delay 1 -o "$CURL_DEST" -w '%{http_code}' "$CURL_URL" >"$http_file" 2>/dev/null || CURL_STATUS=$?
  CURL_HTTP=$(cat "$http_file" 2>/dev/null || true)
  rm -f "$http_file"
}

fetch_url() {
  curl_to "$1" "$2"
  if [ "$CURL_STATUS" -ne 0 ]; then
    die "下载失败（curl ${CURL_STATUS}，HTTP ${CURL_HTTP:-无}）：$1"
  fi
}

resolve_ref() {
  if [ -n "${ONESELF_REF:-}" ]; then
    RESOLVED_REF=$ONESELF_REF
  elif [ -n "$ONESELF_BUNDLED_REF" ]; then
    RESOLVED_REF=$ONESELF_BUNDLED_REF
  else
    RESOLVED_REF=latest
  fi
  ref_ok "$RESOLVED_REF" || die "ONESELF_REF 只能是 latest 或 v1.2.3 这种版本标签"
  if [ "$RESOLVED_REF" = latest ]; then
    need_cmd curl
    api="https://api.github.com/repos/${ONESELF_REPO}/releases/latest"
    meta_file=$(mktemp)
    curl_to "$api" "$meta_file"
    if [ "$CURL_STATUS" -ne 0 ]; then
      rm -f "$meta_file"
      if [ "$CURL_HTTP" = 404 ]; then
        die "还没有正式 Release（HTTP 404）：$api。在仓库里运行 ./deploy/oneself.sh，或设置 ONESELF_REF。"
      fi
      die "无法读取 GitHub Release（curl ${CURL_STATUS}，HTTP ${CURL_HTTP:-无}）：$api"
    fi
    tag=$(sed -n 's/^  "tag_name": "\(v[^"]*\)".*/\1/p' "$meta_file" | head -n 1)
    rm -f "$meta_file"
    [ -n "$tag" ] || die "无法从 GitHub Release 解析版本标签"
    ref_ok "$tag" || die "Release 标签 $tag 不是版本号"
    RESOLVED_REF=$tag
  fi
}

install_launchers() {
  root=$1
  if [ -f "$root/deploy/oneself.sh" ]; then
    cp "$root/deploy/oneself.sh" "$root/oneself.sh"
    chmod 755 "$root/oneself.sh"
  fi
  if [ -f "$root/deploy/oneself.ps1" ]; then
    cp "$root/deploy/oneself.ps1" "$root/oneself.ps1"
    chmod 755 "$root/oneself.ps1"
  fi
}

fetch_bundle() {
  root=$1
  tag=$2
  need_cmd curl
  tmp=$(mktemp -d)
  trap 'rm -rf "$tmp"; trap - INT TERM; exit 130' INT
  trap 'rm -rf "$tmp"; trap - INT TERM; exit 143' TERM
  trap 'rm -rf "$tmp"' EXIT
  base="https://github.com/${ONESELF_REPO}/releases/download/${tag}"
  if download "$base/oneself-compose.tar.gz" "$tmp/bundle.tgz" && download "$base/SHA256SUMS" "$tmp/SHA256SUMS"; then
    expected=$(awk '$2 == "oneself-compose.tar.gz" { print $1; exit }' "$tmp/SHA256SUMS")
    [ -n "$expected" ] || die "SHA256SUMS 里没有 oneself-compose.tar.gz"
    got=$(sha256_file "$tmp/bundle.tgz")
    [ "$got" = "$expected" ] || die "安装包校验失败"
    mkdir -p "$root"
    tar -xzf "$tmp/bundle.tgz" -C "$root"
  else
    warn "这个标签还没有安装包，改从仓库取 compose 文件"
    mkdir -p "$root/deploy"
    raw="https://raw.githubusercontent.com/${ONESELF_REPO}/${tag}"
    fetch_url "$raw/compose.yaml" "$root/compose.yaml"
    fetch_url "$raw/.env.example" "$root/.env.example"
    fetch_url "$raw/deploy/Caddyfile" "$root/deploy/Caddyfile"
    fetch_url "$raw/deploy/oneself.sh" "$root/deploy/oneself.sh"
    fetch_url "$raw/deploy/oneself.ps1" "$root/deploy/oneself.ps1"
    chmod 755 "$root/deploy/oneself.sh" "$root/deploy/oneself.ps1"
  fi
  install_launchers "$root"
  printf 'ref=%s\n' "$tag" >"$root/.oneself-release"
  chmod 644 "$root/.oneself-release"
  rm -rf "$tmp"
  trap - EXIT INT TERM
}

announce_once() {
  if [ "${ANNOUNCED:-}" = 1 ]; then
    return 0
  fi
  choose_install_dir
  announce_install_dir
  ANNOUNCED=1
}

ensure_files() {
  choose_install_dir
  if [ -f "$ROOT/compose.yaml" ] && [ -f "$ROOT/deploy/Caddyfile" ]; then
    return 0
  fi
  if [ "$DRY" = 1 ]; then
    resolve_ref
    info "会下载 ${RESOLVED_REF} 的 compose.yaml、.env.example、deploy/Caddyfile"
    return 0
  fi
  mkdir -p "$ROOT"
  resolve_ref
  fetch_bundle "$ROOT" "$RESOLVED_REF"
  [ -f "$ROOT/compose.yaml" ] || die "安装包里没有 compose.yaml"
  [ -f "$ROOT/deploy/Caddyfile" ] || die "安装包里没有 deploy/Caddyfile"
}

require_root() {
  announce_once
  ensure_files
  if [ "$DRY" = 1 ] && [ ! -f "$ROOT/compose.yaml" ]; then
    return 0
  fi
  [ -f "$ROOT/compose.yaml" ] || die "找不到 compose.yaml。先 install，或用 --dir 指向已安装目录。"
  [ -f "$ROOT/deploy/Caddyfile" ] || die "找不到 deploy/Caddyfile。Caddy 入口需要它，另外两个入口也不会改用别的文件。"
}

compose_cmd() {
  # shellcheck disable=SC2086
  (
    cd "$ROOT"
    COMPOSE_PROFILES=$1
    export COMPOSE_PROFILES
    shift
    docker compose -f compose.yaml --project-directory "$ROOT" "$@"
  )
}

need_compose() {
  need_cmd docker
  docker compose version >/dev/null 2>&1 || die "需要 Docker Compose v2。不要用 docker-compose v1。"
}

guard_source_checkout() {
  is_source_checkout "$ROOT" || return 0
  warn "这是源码目录。此脚本启动的是生产 Compose，不是 pnpm dev，也不是 compose.dev.yaml。"
  if [ "${ONESELF_IN_REPO:-}" != 1 ]; then
    die "源码目录里继续，请显式设置 ONESELF_IN_REPO=1"
  fi
  if [ "$YES" = 1 ] || ! tty_ready; then
    return 0
  fi
  confirm_no "仍然在这个目录安装生产栈？" || die "已取消"
}

ensure_env() {
  example=$ROOT/.env.example
  env=$ROOT/.env
  [ -f "$example" ] || die "缺少 .env.example"
  if [ ! -f "$env" ]; then
    if [ "$DRY" = 1 ]; then
      info "会从 .env.example 创建 .env，并询问 PUBLIC_ORIGIN、所属人口令和入口"
      return 0
    fi
    umask 077
    cp "$example" "$env"
    chmod 600 "$env"
  fi
  if [ -f "$ROOT/.oneself-release" ]; then
    tag=$(sed -n 's/^ref=//p' "$ROOT/.oneself-release" | head -n 1)
    if [ -n "$tag" ] && image=$(image_for_ref "$tag"); then
      current=$(read_env ONESELF_IMAGE "$env")
      case "$current" in
        "" | docker.io/ptonlix/oneself:* | "$ONESELF_IMAGE_REPO":*)
          write_env_value ONESELF_IMAGE "$image" "$env"
          ;;
        *:local | oneself:local) ;;
        *) warn "保留已有 ONESELF_IMAGE" ;;
      esac
    fi
  fi
  fill_env "$env"
}

fill_env() {
  env=$1
  origin=$(read_env PUBLIC_ORIGIN "$env")
  if ! origin_ok "$origin"; then
    if [ "$DRY" = 1 ]; then
      info "PUBLIC_ORIGIN 还是占位，正式运行前会询问"
    elif ! tty_ready && [ "$YES" = 1 ]; then
      die "非交互安装必须先准备好合法的 PUBLIC_ORIGIN"
    else
      tty_ready || die "没有终端可询问 PUBLIC_ORIGIN。请先写入 .env，或设置变量后用 --yes"
      printf '\n%s对外源%s  发现文档和批准地址只用它，不看请求 Host。\n' "$BOLD" "$RESET" >/dev/tty
      while :; do
        origin=$(ask_line "PUBLIC_ORIGIN [https://自己的域名]: " "")
        origin=${origin%/}
        origin_ok "$origin" && break
        warn "必须是 https://主机 或 https://主机:端口，不能带路径。example.invalid 不能用。"
      done
      write_env_value PUBLIC_ORIGIN "$origin" "$env"
    fi
  fi

  login=$(read_env OWNER_LOGIN "$env")
  if [ -z "$login" ]; then
    login=$(ask_line "所属人账号 [owner]: " "owner")
    [ "$DRY" = 1 ] || write_env_value OWNER_LOGIN "$login" "$env"
  fi

  owner=$(read_env OWNER_PASSWORD "$env")
  if ! secret_ok "$owner"; then
    if [ "$DRY" = 1 ]; then
      info "所属人初始口令还是占位，正式运行前会询问"
    elif [ -n "${OWNER_PASSWORD:-}" ] && secret_ok "$OWNER_PASSWORD"; then
      write_env_value OWNER_PASSWORD "$OWNER_PASSWORD" "$env"
    elif ! tty_ready; then
      die "OWNER_PASSWORD 还是占位。非交互时从环境变量传入一个不含 \$ 的口令。"
    else
      while :; do
        owner=$(read_secret "所属人初始口令（不会回显，登录后仍要修改）: ")
        again=$(read_secret "再输入一次: ")
        [ "$owner" = "$again" ] || {
          warn "两次不一致"
          continue
        }
        secret_ok "$owner" && break
        warn "口令不能为空、不能是 change-me，也不能含 \$ 或反引号。"
      done
      write_env_value OWNER_PASSWORD "$owner" "$env"
    fi
  fi

  for key in POSTGRES_PASSWORD RUSTFS_ACCESS_KEY RUSTFS_SECRET_KEY; do
    current=$(read_env "$key" "$env")
    if example_secret "$current"; then
      continue
    fi
    secret_ok "$current" || die "$key 已有值，但不能使用（不能是 password、secret，也不能含 \$ 或反引号）。不会改写 .env。"
  done
  fill_generated POSTGRES_PASSWORD "数据库口令" "$env"
  fill_generated RUSTFS_ACCESS_KEY "对象存储访问密钥" "$env"
  fill_generated RUSTFS_SECRET_KEY "对象存储秘密密钥" "$env"

  profile=$(read_env COMPOSE_PROFILES "$env")
  if ! profile_ok "$profile"; then
    if [ "$DRY" = 1 ]; then
      info "会询问唯一入口：cloudflared、caddy 或 tailscale"
      return 0
    fi
    if ! tty_ready; then
      profile=cloudflared
    else
      printf '\n%s入口%s  同一时间只能选一个。换入口不改应用镜像。\n' "$BOLD" "$RESET" >/dev/tty
      printf '  1  cloudflared   默认。不开放路由器端口\n' >/dev/tty
      printf '  2  caddy         自己的域名，80 和 443 必须能从公网到达\n' >/dev/tty
      printf '  3  tailscale     只有同一 tailnet。只做 Serve，不开 Funnel\n' >/dev/tty
      choice=$(ask_line "选择 [1]: " "1")
      case "$choice" in
        1 | cloudflared) profile=cloudflared ;;
        2 | caddy) profile=caddy ;;
        3 | tailscale) profile=tailscale ;;
        *) die "入口只能是 cloudflared、caddy 或 tailscale" ;;
      esac
    fi
    write_env_value COMPOSE_PROFILES "$profile" "$env"
  fi
  fill_profile_secret "$profile" "$env"
}

hex_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 24
  else
    od -An -N 24 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

example_secret() {
  case "$1" in
    "" | change-me) return 0 ;;
    *) return 1 ;;
  esac
}

fill_generated() {
  key=$1
  label=$2
  env=$3
  current=$(read_env "$key" "$env")
  if example_secret "$current"; then
    if [ "$DRY" = 1 ]; then
      info "会为 $label 生成随机值，只写入 .env"
      return 0
    fi
    generated=$(hex_secret)
    secret_ok "$generated" || die "无法生成 $label"
    write_env_value "$key" "$generated" "$env"
    info "$label 已写入 .env，不在终端显示"
    return 0
  fi
  secret_ok "$current" && return 0
  die "$key 已有值，但不能使用（不能是 password、secret，也不能含 \$ 或反引号）。不会改写 .env。"
}

fill_profile_secret() {
  profile=$1
  env=$2
  case "$profile" in
    cloudflared)
      key=TUNNEL_TOKEN
      label="Cloudflare Tunnel 令牌"
      ;;
    caddy)
      domain=$(read_env APP_DOMAIN "$env")
      email=$(read_env ACME_EMAIL "$env")
      if [ -z "$domain" ] && tty_ready && [ "$DRY" != 1 ]; then
        domain=$(ask_line "APP_DOMAIN [和 PUBLIC_ORIGIN 的主机名一致]: " "")
        [ -n "$domain" ] && write_env_value APP_DOMAIN "$domain" "$env"
      fi
      if [ -z "$email" ] && tty_ready && [ "$DRY" != 1 ]; then
        email=$(ask_line "ACME_EMAIL: " "")
        [ -n "$email" ] && write_env_value ACME_EMAIL "$email" "$env"
      fi
      return 0
      ;;
    tailscale)
      key=TAILSCALE_AUTHKEY
      label="Tailscale auth key"
      ;;
    *) return 0 ;;
  esac
  current=$(read_env "$key" "$env")
  [ -n "$current" ] && return 0
  if [ "$DRY" = 1 ]; then
    info "入口令牌可以留空。留空时入口容器可以失败，应用和数据库仍会留下。"
    return 0
  fi
  if tty_ready; then
    value=$(read_secret "$label（可直接回车，入口以后再补）: ")
    [ -n "$value" ] && write_env_value "$key" "$value" "$env"
  else
    warn "$label 为空。入口容器可以失败，应用和数据库仍会留下。"
  fi
}

running_services() {
  profile=$1
  compose_cmd "$profile" ps --status running --format '{{.Service}}' 2>/dev/null || true
}

stop_other_ingress() {
  selected=$1
  name=
  for name in cloudflared caddy tailscale; do
    [ "$name" = "$selected" ] && continue
    if [ "$DRY" = 1 ]; then
      info "会停止另一个入口 $name"
      continue
    fi
    compose_cmd "$name" stop "$name" >/dev/null 2>&1 || warn "没能停止 $name。如果它仍在跑，doctor 会标出来。"
  done
}

cmd_install() {
  show_banner 1
  announce_once
  need_compose
  ensure_files
  if [ "$DRY" = 1 ] && [ ! -f "${ROOT:-}/compose.yaml" ]; then
    info "dry-run：不会创建目录，也不会启动容器"
    return 0
  fi
  require_root
  guard_source_checkout
  maybe_sync_bundle
  ensure_env
  profile=$(read_env COMPOSE_PROFILES "$ROOT/.env")
  profile_ok "$profile" || die "COMPOSE_PROFILES 必须恰好是 cloudflared、caddy、tailscale 之一"
  origin=$(read_env PUBLIC_ORIGIN "$ROOT/.env")
  image=$(read_env ONESELF_IMAGE "$ROOT/.env")
  printf '\n'
  info "目录    $ROOT"
  info "入口    $profile"
  info "对外源  $origin"
  info "镜像    ${image:-未设置}"
  stop_other_ingress "$profile"
  if [ "$DRY" = 1 ]; then
    info "dry-run：不会执行 docker compose"
    return 0
  fi
  case "$image" in
    *:local | oneself:local)
      info "本地镜像，构建后启动"
      compose_cmd "$profile" up -d --build
      ;;
    *)
      info "拉取镜像并启动。数据库和对象存储不映射宿主机端口。"
      compose_cmd "$profile" pull
      compose_cmd "$profile" up -d
      ;;
  esac
  printf '\n'
  ok "栈已提交给 Compose。迁移在应用监听前完成，失败则不会监听。"
  printf '   管理端   %s/admin\n' "$origin"
  printf '   发现文档 %s/.well-known/pcp\n' "$origin"
  printf '   接 Agent npx skills add %s -a <agent> -s oneself -y\n' "$origin"
  if is_source_checkout "$ROOT"; then
    printf '   以后更新 %s/deploy/oneself.sh update\n' "$ROOT"
  else
    install_launchers "$ROOT"
    printf '   以后更新 %s/oneself.sh update\n' "$ROOT"
    printf '   换版本时在这个目录重新取一次 Release 脚本，口令不会被覆盖。\n'
  fi
}

cmd_update() {
  show_banner 0
  announce_once
  need_compose
  require_root
  [ -f "$ROOT/.env" ] || die "没有 .env。先运行安装。"
  maybe_sync_bundle
  pin_image_from_release
  profile=$(read_env COMPOSE_PROFILES "$ROOT/.env")
  profile_ok "$profile" || die "COMPOSE_PROFILES 必须恰好是一个入口"
  stop_other_ingress "$profile"
  if [ "$DRY" = 1 ]; then
    info "dry-run：会在 $ROOT 执行 docker compose pull && up -d"
    return 0
  fi
  compose_cmd "$profile" pull
  compose_cmd "$profile" up -d
  ok "已按当前 .env 的镜像更新。换版本请重新取对应 Release 的 oneself.sh，它只改镜像标签，不覆盖口令。"
}

cmd_doctor() {
  show_banner 0
  announce_once
  fails=0
  warns=0
  note_fail() {
    fails=$((fails + 1))
    printf '%s✗%s %s\n' "$ROSE" "$RESET" "$*"
  }
  note_warn() {
    warns=$((warns + 1))
    printf '%s!%s %s\n' "$AMBER" "$RESET" "$*"
  }

  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    ok "Docker Compose v2"
  else
    note_fail "没有 Docker Compose v2"
  fi

  if [ ! -f "$ROOT/compose.yaml" ] || [ ! -f "$ROOT/deploy/Caddyfile" ]; then
    note_fail "找不到 compose.yaml 或 deploy/Caddyfile。doctor 不会下载，也不会创建目录。"
  fi

  if [ ! -f "$ROOT/.env" ]; then
    note_fail "没有 .env"
    profile=cloudflared
    origin=
  else
  [ "$(stat -f %Lp "$ROOT/.env" 2>/dev/null || stat -c %a "$ROOT/.env" 2>/dev/null || printf 644)" = 600 ] ||
    note_warn ".env 不是仅当前用户可读（600）。检查不会改它。"

  profile=$(read_env COMPOSE_PROFILES "$ROOT/.env")
  if profile_ok "$profile"; then
    ok "入口只有 $profile"
  else
    note_fail "COMPOSE_PROFILES=$profile，必须恰好是 cloudflared、caddy 或 tailscale"
    profile=cloudflared
  fi

  origin=$(read_env PUBLIC_ORIGIN "$ROOT/.env")
  if origin_ok "$origin"; then
    ok "PUBLIC_ORIGIN $origin"
  else
    note_fail "PUBLIC_ORIGIN 不合法或仍是占位。不从 Host 推断。"
    origin=
  fi

  for key in OWNER_PASSWORD POSTGRES_PASSWORD RUSTFS_ACCESS_KEY RUSTFS_SECRET_KEY; do
    value=$(read_env "$key" "$ROOT/.env")
    if secret_ok "$value"; then
      ok "$key 已设置"
    else
      note_fail "$key 仍是占位、为空，或含 \$"
    fi
  done

  case "$profile" in
    cloudflared)
      [ -n "$(read_env TUNNEL_TOKEN "$ROOT/.env")" ] || note_warn "TUNNEL_TOKEN 为空。入口可以失败，应用和数据库仍应留下。"
      ;;
    caddy)
      domain=$(read_env APP_DOMAIN "$ROOT/.env")
      [ -n "$domain" ] || note_warn "APP_DOMAIN 为空"
      [ -n "$(read_env ACME_EMAIL "$ROOT/.env")" ] || note_warn "ACME_EMAIL 为空"
      if [ -n "$origin" ] && [ -n "$domain" ] && [ "$domain" != "$(origin_host "$origin")" ]; then
        note_warn "APP_DOMAIN 和 PUBLIC_ORIGIN 的主机名不一致。发现地址以 PUBLIC_ORIGIN 为准。"
      fi
      ;;
    tailscale)
      [ -n "$(read_env TAILSCALE_AUTHKEY "$ROOT/.env")" ] || note_warn "TAILSCALE_AUTHKEY 为空。不要为此把数据库端口映射出去。"
      ;;
  esac
  fi

  if [ -f "$ROOT/compose.yaml" ] && command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    services=$(running_services "$profile")
    ingresses=0
    for name in cloudflared caddy tailscale; do
      if printf '%s\n' "$services" | grep -qx "$name"; then
        ingresses=$((ingresses + 1))
      fi
    done
    if [ "$ingresses" -gt 1 ]; then
      note_fail "有 $ingresses 个入口容器在跑"
    elif [ "$ingresses" = 1 ]; then
      ok "正在跑的入口不超过一个"
    else
      note_warn "入口容器没在跑。没有令牌时这是允许的。"
    fi
    if printf '%s\n' "$services" | grep -qx postgres; then
      published=$(compose_cmd "$profile" port postgres 5432 2>/dev/null || true)
      if [ -n "$published" ]; then
        note_fail "PostgreSQL 映射到了宿主机：$published"
      else
        ok "PostgreSQL 没有宿主机端口"
      fi
    fi
    if printf '%s\n' "$services" | grep -qx app; then
      ok "应用容器在跑"
    else
      note_warn "应用容器没在跑"
    fi
  fi

  if [ -n "$origin" ] && command -v curl >/dev/null 2>&1; then
    if body=$(curl -fsS --max-time 20 "$origin/.well-known/pcp" 2>/dev/null); then
      compact=$(printf '%s' "$body" | tr -d ' \n')
      if printf '%s' "$compact" | grep -q '"protocol":"pcp"'; then
        ok "发现文档可达"
      else
        note_fail "对外源有响应，但不是 PCP 发现文档"
      fi
    else
      note_warn "现在访问不到 $origin/.well-known/pcp"
    fi
    if body=$(curl -fsS --max-time 20 "$origin/.well-known/agent-skills/index.json" 2>/dev/null); then
      compact=$(printf '%s' "$body" | tr -d ' \n')
      if printf '%s' "$compact" | grep -q '"name":"oneself"' && printf '%s' "$compact" | grep -q '"type":"archive"'; then
        ok "Skill 安装索引只有 oneself 的 archive"
      else
        note_fail "Skill 安装索引不是预期的 oneself archive"
      fi
    fi
  fi

  printf '\n'
  if [ "$fails" -gt 0 ]; then
    printf '%s%d 项失败%s，%s%d 项提醒%s\n' "$ROSE" "$fails" "$RESET" "$AMBER" "$warns" "$RESET"
    exit 1
  fi
  printf '%s通过%s，%s%d 项提醒%s\n' "$TEAL" "$RESET" "$AMBER" "$warns" "$RESET"
}

cmd_transfer() {
  kind=$1
  shift
  require_root
  [ -f "$ROOT/scripts/transfer-cli.ts" ] || die "生产安装包不含备份程序。在检出的仓库里运行 pnpm data:export / data:import。不要用 shell 重写一份。"
  need_cmd node
  if [ "$DRY" = 1 ]; then
    info "dry-run：会运行 scripts/transfer-cli.ts $kind $*"
    return 0
  fi
  (
    cd "$ROOT"
    node --env-file=.env --experimental-strip-types scripts/transfer-cli.ts "$kind" "$@"
  )
}

self_test() {
  fails=0
  expect_ok() {
    if "$@"; then
      return 0
    fi
    printf 'FAIL %s\n' "$*" >&2
    fails=$((fails + 1))
  }
  expect_no() {
    if "$@"; then
      printf 'FAIL expected reject %s\n' "$*" >&2
      fails=$((fails + 1))
    fi
  }
  expect_ok profile_ok cloudflared
  expect_ok profile_ok caddy
  expect_ok profile_ok tailscale
  expect_no profile_ok "cloudflared,caddy"
  expect_no profile_ok ""
  expect_ok origin_ok "https://oneself.example.com"
  expect_ok origin_ok "https://host.tailnet.ts.net"
  expect_ok origin_ok "https://oneself.example.com:8443"
  expect_no origin_ok "https://example.invalid"
  expect_no origin_ok "http://oneself.example.com"
  expect_no origin_ok "https://oneself.example.com/pcp"
  expect_no origin_ok "https://user:pass@oneself.example.com"
  saved_http=${ONESELF_ALLOW_HTTP:-}
  ONESELF_ALLOW_HTTP=1
  expect_ok origin_ok "http://oneself.example.com"
  ONESELF_ALLOW_HTTP=$saved_http
  expect_ok ref_ok latest
  expect_ok ref_ok v1.2.3
  expect_ok ref_ok v1.2.3-rc.1
  expect_no ref_ok main
  expect_no ref_ok v1.2
  expect_no ref_ok v1.2.3foo
  expect_no ref_ok 'v1.2.3-'
  expect_ok ref_newer v1.2.4 v1.2.3
  expect_ok ref_newer v1.2.3 v1.2.3-rc.1
  expect_no ref_newer v1.2.3 v1.2.4
  expect_no ref_newer v1.2.3-rc.1 v1.2.3
  expect_no ref_newer v1.2.3 v1.2.3
  image=$(image_for_ref v1.2.3)
  [ "$image" = "docker.io/ptonlix/oneself:1.2.3" ] || {
    printf 'FAIL image pin %s\n' "$image" >&2
    fails=$((fails + 1))
  }
  image=$(image_for_ref latest)
  [ "$image" = "docker.io/ptonlix/oneself:latest" ] || {
    printf 'FAIL latest image %s\n' "$image" >&2
    fails=$((fails + 1))
  }
  expect_ok secret_ok "correct-horse-battery"
  expect_no secret_ok change-me
  expect_no secret_ok 'has$dollar'
  def=$(default_install_dir)
  win=$(to_shell_path 'C:\Users\ada\AppData\Local')
  [ "$win" = "/c/Users/ada/AppData/Local" ] || {
    printf 'FAIL to_shell_path %s\n' "$win" >&2
    fails=$((fails + 1))
  }
  back=$(to_windows_path /c/Users/ada/AppData/Local/oneself)
  [ "$back" = 'C:\Users\ada\AppData\Local\oneself' ] || {
    printf 'FAIL to_windows_path %s\n' "$back" >&2
    fails=$((fails + 1))
  }
  case "$def" in
    */oneself) ;;
    *)
      printf 'FAIL default dir %s\n' "$def" >&2
      fails=$((fails + 1))
      ;;
  esac
  parent=$(mktemp -d)
  got=$(expand_dir "$parent/stack")
  [ "$got" = "$parent/stack" ] || {
    printf 'FAIL expand_dir %s\n' "$got" >&2
    fails=$((fails + 1))
  }
  if (expand_dir "$parent/stack/") >/dev/null 2>&1; then
    printf 'FAIL expand_dir accepted trailing slash\n' >&2
    fails=$((fails + 1))
  fi
  rm -rf "$parent"
  tmp=$(mktemp)
  printf 'PUBLIC_ORIGIN=https://example.invalid\n# keep\nOWNER_LOGIN=owner\n' >"$tmp"
  write_env_value PUBLIC_ORIGIN "https://oneself.example.com" "$tmp"
  got=$(read_env PUBLIC_ORIGIN "$tmp")
  [ "$got" = "https://oneself.example.com" ] || {
    printf 'FAIL env write %s\n' "$got" >&2
    fails=$((fails + 1))
  }
  grep -q '^# keep$' "$tmp" || {
    printf 'FAIL dropped comment\n' >&2
    fails=$((fails + 1))
  }
  write_env_value POSTGRES_PASSWORD 'keep\tthis' "$tmp"
  got=$(read_env POSTGRES_PASSWORD "$tmp")
  [ "$got" = 'keep\tthis' ] || {
    printf 'FAIL backslash secret %s\n' "$got" >&2
    fails=$((fails + 1))
  }
  grep -F 'POSTGRES_PASSWORD=keep\tthis' "$tmp" >/dev/null || {
    printf 'FAIL backslash was rewritten in .env\n' >&2
    fails=$((fails + 1))
  }
  rm -f "$tmp"
  saved_yes=$YES
  saved_yes_env=${ONESELF_YES:-}
  YES=0
  ONESELF_YES=1
  honor_yes
  [ "$YES" = 1 ] || {
    printf 'FAIL ONESELF_YES did not set YES\n' >&2
    fails=$((fails + 1))
  }
  YES=0
  ONESELF_YES=0
  honor_yes
  [ "$YES" = 0 ] || {
    printf 'FAIL ONESELF_YES=0 changed YES\n' >&2
    fails=$((fails + 1))
  }
  YES=$saved_yes
  if [ -n "$saved_yes_env" ]; then
    ONESELF_YES=$saved_yes_env
  else
    unset ONESELF_YES
  fi
  [ "$fails" -eq 0 ] || exit 1
  printf 'self-test ok\n'
}

pin_image_from_release() {
  [ -f "$ROOT/.env" ] || return 0
  [ -f "$ROOT/.oneself-release" ] || return 0
  tag=$(sed -n 's/^ref=//p' "$ROOT/.oneself-release" | head -n 1)
  image=$(image_for_ref "$tag") || return 0
  current=$(read_env ONESELF_IMAGE "$ROOT/.env")
  case "$current" in
    "" | docker.io/ptonlix/oneself:* | "$ONESELF_IMAGE_REPO":*)
      [ "$current" = "$image" ] && return 0
      if [ "$DRY" = 1 ]; then
        info "会把 ONESELF_IMAGE 定为 $image"
        return 0
      fi
      write_env_value ONESELF_IMAGE "$image" "$ROOT/.env"
      info "镜像标签定为 $image"
      ;;
    *) ;;
  esac
}

maybe_sync_bundle() {
  is_source_checkout "$ROOT" && return 0
  if [ -z "${ONESELF_REF:-}" ]; then
    [ -n "$ONESELF_BUNDLED_REF" ] || return 0
    current=
    if [ -f "$ROOT/.oneself-release" ]; then
      current=$(sed -n 's/^ref=//p' "$ROOT/.oneself-release" | head -n 1)
    fi
    if ref_newer "$current" "$ONESELF_BUNDLED_REF"; then
      warn "已安装 $current，比这份脚本的 $ONESELF_BUNDLED_REF 新。不往回同步。"
      return 0
    fi
  fi
  [ -n "$ONESELF_BUNDLED_REF" ] || [ -n "${ONESELF_REF:-}" ] || return 0
  resolve_ref
  current=
  if [ -f "$ROOT/.oneself-release" ]; then
    current=$(sed -n 's/^ref=//p' "$ROOT/.oneself-release" | head -n 1)
  fi
  [ "$current" = "$RESOLVED_REF" ] && return 0
  info "安装文件从 ${current:-未记录} 换到 $RESOLVED_REF。不覆盖 .env。"
  if [ "$DRY" = 1 ]; then
    return 0
  fi
  fetch_bundle "$ROOT" "$RESOLVED_REF"
}

main() {
  honor_yes
  while [ $# -gt 0 ]; do
    case "$1" in
      --dir)
        [ $# -ge 2 ] || die "--dir 需要一个目录"
        [ -z "${ONESELF_DIR:-}" ] || die "目录指定了两次"
        ONESELF_DIR=$2
        shift 2
        ;;
      --dir=*)
        [ -z "${ONESELF_DIR:-}" ] || die "目录指定了两次"
        ONESELF_DIR=${1#--dir=}
        [ -n "$ONESELF_DIR" ] || die "--dir 需要一个目录"
        shift
        ;;
      *)
        if take_flag "$1"; then
          shift
          if [ "$CMD" = backup ] || [ "$CMD" = restore ]; then
            break
          fi
        else
          case "$1" in
            -*) die "无法识别 $1。运行 oneself.sh help" ;;
          esac
          [ -z "${ONESELF_DIR:-}" ] || die "目录指定了两次：$1"
          ONESELF_DIR=$1
          shift
        fi
        ;;
    esac
  done
  setup_colors
  case "$CMD" in
    help)
      printf '\n'
      draw_scene 99
      printf '\n'
      usage
      ;;
    self-test) self_test ;;
    install) cmd_install ;;
    update)
      [ $# -eq 0 ] || die "update 不接受多余参数"
      cmd_update
      ;;
    doctor)
      [ $# -eq 0 ] || die "doctor 不接受多余参数"
      cmd_doctor
      ;;
    backup) cmd_transfer export "$@" ;;
    restore) cmd_transfer import "$@" ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
}

main "$@"
