#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
SERVER="$ROOT/server"
OUT="$SERVER/bin"
BUILD_REVISION=$(git -C "$ROOT" rev-parse --verify HEAD)

mkdir -p "$OUT"

build_pair() {
	local os="$1" arch="$2" suffix="$3" ldflags="-s -w -X main.buildRevision=$BUILD_REVISION"
	if [[ "$os" == android ]]; then
		# github.com/wlynxg/anet uses //go:linkname for Android network APIs.
		# Its documented Go 1.23+ build requirement is -checklinkname=0.
		ldflags+=' -checklinkname=0'
	fi
	for program in worldd directoryd; do
		printf 'Building %s for %s/%s\n' "$program" "$os" "$arch"
		(
			cd "$SERVER"
			GOOS="$os" GOARCH="$arch" CGO_ENABLED=0 \
				go build -buildvcs=false -trimpath -ldflags="$ldflags" \
				-o "$OUT/$program-$suffix" "./$program"
		)
	done
}

target=${1:-all}
case "$target" in
	linux-amd64) build_pair linux amd64 linux-amd64 ;;
	linux-arm64) build_pair linux arm64 linux-arm64 ;;
	android-arm64) build_pair android arm64 android-arm64 ;;
	all)
		build_pair linux amd64 linux-amd64
		build_pair linux arm64 linux-arm64
		build_pair android arm64 android-arm64
		;;
	*)
		printf 'Usage: %s [all|linux-amd64|linux-arm64|android-arm64]\n' "$0" >&2
		exit 2
		;;
esac
