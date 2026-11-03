#!/bin/sh
# Public thin entry (Release oneself.sh): download verified platform binary and run it.
# curl -fsSL …/oneself.sh | sh
# All install logic lives in the CLI (apps/cli); this script only picks, verifies and runs it.
#
# 发布工作流把下一行改成具体标签（这份启动脚本属于哪个 Release）。仓库副本保持 latest。
ONESELF_BOOTSTRAP_REF=latest

set -eu

ONESELF_REPO="${ONESELF_REPO:-ptonlix/OneSelf}"

# Downgrade protection depends on telling these apart:
#   - user_ref: ONESELF_REF the *user* set before running us (may force any tag, even older)
#   - ref:      what we download = user_ref, else this script's own Release tag
# Only user_ref is ever exported as ONESELF_REF. The script's own tag goes out as
# ONESELF_BUNDLED_REF, which the CLI compares against .oneself-release and never
# uses to move an install backwards. Empty ONESELF_REF counts as unset.
user_ref="${ONESELF_REF:-}"
if [ -n "$user_ref" ]; then
  ref=$user_ref
else
  ref=$ONESELF_BOOTSTRAP_REF
fi

die() {
  printf 'oneself: %s\n' "$*" >&2
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "缺少 $1"
}

ref_ok() {
  case "$1" in
    latest) return 0 ;;
    v[0-9]*.[0-9]*.[0-9]*) ;;
    *) return 1 ;;
  esac
  printf '%s\n' "$1" | grep -Eq '^v[0-9]+\.[0-9]+\.[0-9]+(-[0-9A-Za-z.-]+)?$'
}

need_cmd curl
need_cmd uname
need_cmd mkdir
need_cmd grep

ref_ok "$ref" || die "ONESELF_REF 只能是 latest 或 v1.2.3 这种版本标签"

os=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)
case "$arch" in
  x86_64 | amd64) arch=amd64 ;;
  aarch64 | arm64) arch=arm64 ;;
  *) die "暂不支持架构: $arch" ;;
esac
case "$os" in
  darwin | linux) ;;
  msys* | mingw* | cygwin*) die "Windows 请用 oneself.ps1 安装" ;;
  *) die "暂不支持系统: $os" ;;
esac

libc=
if [ "$os" = linux ]; then
  if [ -f /etc/alpine-release ]; then
    libc=musl
  elif command -v ldd >/dev/null 2>&1 && ldd --version 2>&1 | head -n1 | grep -qi musl; then
    libc=musl
  fi
fi

if [ -n "$libc" ]; then
  asset="oneself-${os}-${arch}-${libc}"
else
  asset="oneself-${os}-${arch}"
fi

if [ "$ref" = latest ]; then
  url="https://github.com/${ONESELF_REPO}/releases/latest/download/${asset}"
  sums_url="https://github.com/${ONESELF_REPO}/releases/latest/download/SHA256SUMS"
else
  url="https://github.com/${ONESELF_REPO}/releases/download/${ref}/${asset}"
  sums_url="https://github.com/${ONESELF_REPO}/releases/download/${ref}/SHA256SUMS"
fi

cache_root="${XDG_CACHE_HOME:-${HOME}/.cache}/oneself"
mkdir -p "$cache_root"
bin="${cache_root}/${asset}"
tmp_bin="${bin}.$$"
sums="${cache_root}/SHA256SUMS.$$"
trap 'rm -f "$tmp_bin" "$sums"' EXIT
trap 'rm -f "$tmp_bin" "$sums"; exit 130' INT
trap 'rm -f "$tmp_bin" "$sums"; exit 143' TERM
# 二进制有几十 MB：stderr 是终端时用 curl 自带的进度条（打在 stderr），
# 否则（CI、日志重定向）保持静默。SHA256SUMS 很小，始终静默。
if [ -t 2 ]; then
  printf 'oneself: 下载 %s（%s）\n' "$asset" "$ref" >&2
  dl_failed=0
  curl -fL --progress-bar --retry 3 --retry-delay 1 "$url" -o "$tmp_bin" || dl_failed=1
else
  printf 'oneself: 下载 %s\n' "$url" >&2
  dl_failed=0
  curl -fsSL --retry 3 --retry-delay 1 "$url" -o "$tmp_bin" || dl_failed=1
fi
if [ "$dl_failed" -ne 0 ]; then
  if [ -n "$libc" ]; then
    die "下载失败: $url（这个 Release 没有 ${asset}；musl/Alpine 请等带 musl 资产的 Release，或改用 glibc 主机）"
  fi
  die "下载失败: $url"
fi
curl -fsSL --retry 3 --retry-delay 1 "$sums_url" -o "$sums" || die "下载 SHA256SUMS 失败"
expected=$(awk -v f="$asset" '$2 == f { print $1; exit }' "$sums")
rm -f "$sums"
if [ -z "$expected" ]; then
  if [ -n "$libc" ]; then
    die "SHA256SUMS 里没有 $asset（这个 Release 没有 musl 资产；请等带 musl 资产的 Release，或改用 glibc 主机）"
  fi
  die "SHA256SUMS 里没有 $asset"
fi
if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$tmp_bin" | awk '{print $1}')
else
  got=$(shasum -a 256 "$tmp_bin" | awk '{print $1}')
fi
[ "$got" = "$expected" ] || die "二进制校验失败"
chmod 755 "$tmp_bin"
mv -f "$tmp_bin" "$bin"
trap - EXIT INT TERM
# The binary we just verified belongs to $ref. When the user did not force a ref
# this equals ONESELF_BOOTSTRAP_REF (a concrete tag on Release copies; latest only
# for the repo copy, which the CLI resolves via the GitHub API).
ONESELF_BUNDLED_REF=$ref
export ONESELF_BUNDLED_REF
if [ -n "$user_ref" ]; then
  ONESELF_REF=$user_ref
  export ONESELF_REF
else
  unset ONESELF_REF 2>/dev/null || true
fi
export ONESELF_SELF_BIN="$bin"

if [ "$#" -eq 0 ]; then
  set -- install
fi
case "$1" in
  install | update | doctor | backup | restore | help | --help | -h) ;;
  --*) set -- install "$@" ;;
  *) set -- install "$@" ;;
esac

# curl|sh leaves stdin as a pipe. Do not open /dev/tty for the handoff: that
# fd is a TTY, but the Bun-compiled CLI on macOS never receives keypresses on
# it, so arrow keys and Enter do nothing. Duplicate the shell's already-open
# terminal (stdout, else stderr) instead. With no terminal, keep the original
# stdin; the CLI then requires --yes / ONESELF_YES=1.
if [ ! -t 0 ]; then
  if [ -t 1 ]; then
    exec "$bin" "$@" <&1
  elif [ -t 2 ]; then
    exec "$bin" "$@" <&2
  fi
fi
exec "$bin" "$@"
