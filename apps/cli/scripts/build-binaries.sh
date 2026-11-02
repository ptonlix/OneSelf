#!/bin/sh
# Build standalone installers with Bun compile (glibc + musl where available).
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
outdir=${1:-"$root/dist/bin"}
mkdir -p "$outdir"
cd "$root"

command -v bun >/dev/null 2>&1 || {
  echo "需要 bun：https://bun.sh" >&2
  exit 1
}

entry="$root/src/main.ts"
# name:bun-target
targets='
oneself-darwin-arm64:bun-darwin-arm64
oneself-darwin-amd64:bun-darwin-x64
oneself-linux-amd64:bun-linux-x64
oneself-linux-arm64:bun-linux-arm64
oneself-linux-amd64-musl:bun-linux-x64-musl
oneself-linux-arm64-musl:bun-linux-arm64-musl
oneself-windows-amd64.exe:bun-windows-x64
'

failed=0
for item in $targets; do
  name=${item%%:*}
  target=${item#*:}
  echo "building $name ($target)"
  if ! bun build --compile --target="$target" --outfile="$outdir/$name" "$entry"; then
    echo "warn: failed $name ($target) — skipping" >&2
    failed=1
    # musl targets may be unavailable on older bun; glibc/windows/darwin must succeed
    case "$name" in
      *-musl) ;;
      *) exit 1 ;;
    esac
  fi
done
echo "done → $outdir"
ls -lh "$outdir"
[ "$failed" = 0 ] || echo "note: some optional musl targets were skipped"
