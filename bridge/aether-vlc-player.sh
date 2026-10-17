#!/bin/bash
# ── aether-vlc-player.sh ──────────────────────────────────────────────
# Custom player wrapper for ani-cli on Windows.
# Uses a local HLS proxy to add proper Referer headers that VLC needs
# for protected HLS streams.
#
# ani-cli calls the player like:
#   $player_function --http-referrer="$refr" --play-and-exit \
#       --meta-title="Title Episode N" "$video_link" \
#       [:input-slave="$sub_link"]
#
# This script parses those arguments, starts the Python HLS proxy,
# and lets the proxy launch VLC.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Search for hls_proxy.py in common locations
HLS_PROXY=""
if [ -n "$AETHER_HLS_PROXY" ] && [ -f "$AETHER_HLS_PROXY" ]; then
    HLS_PROXY="$AETHER_HLS_PROXY"
elif [ -f "$SCRIPT_DIR/hls_proxy.py" ]; then
    HLS_PROXY="$SCRIPT_DIR/hls_proxy.py"
elif [ -f "$SCRIPT_DIR/bridge/hls_proxy.py" ]; then
    HLS_PROXY="$SCRIPT_DIR/bridge/hls_proxy.py"
elif [ -f "$HOME/Documents/Aether Codex/Aether-Codex/bridge/hls_proxy.py" ]; then
    HLS_PROXY="$HOME/Documents/Aether Codex/Aether-Codex/bridge/hls_proxy.py"
elif [ -f "/c/Users/Blink/Documents/Aether Codex/Aether-Codex/bridge/hls_proxy.py" ]; then
    HLS_PROXY="/c/Users/Blink/Documents/Aether Codex/Aether-Codex/bridge/hls_proxy.py"
fi

# Parse arguments that ani-cli passes
REFERER=""
TITLE=""
VIDEO_URL=""
SUB_URL=""

while [ $# -gt 0 ]; do
    case "$1" in
        --http-referrer=*)
            REFERER="${1#--http-referrer=}"
            ;;
        --play-and-exit)
            # VLC flag, proxy handles this
            ;;
        --meta-title=*)
            TITLE="${1#--meta-title=}"
            ;;
        :input-slave=*)
            SUB_URL="${1#:input-slave=}"
            ;;
        -*)
            # Skip other flags
            ;;
        *)
            # First non-flag argument is the video URL
            if [ -z "$VIDEO_URL" ]; then
                VIDEO_URL="$1"
            fi
            ;;
    esac
    shift
done

if [ -z "$VIDEO_URL" ]; then
    echo "[aether-vlc] ERROR: No video URL provided" >&2
    exit 1
fi

if [ -z "$REFERER" ]; then
    echo "[aether-vlc] WARNING: No referrer provided, VLC may get 403 errors" >&2
    REFERER="https://hianime.at/"
fi

# Find Python
PYTHON=""
if command -v python3 >/dev/null 2>&1; then
    PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
    PYTHON="python"
elif command -v py >/dev/null 2>&1; then
    PYTHON="py"
else
    echo "[aether-vlc] ERROR: Python not found! Cannot start HLS proxy." >&2
    echo "[aether-vlc] Falling back to direct VLC (may get 403 errors)..." >&2
    [ "$DISPLAY" = "needs-to-be-defined" ] && unset DISPLAY
    vlc.exe --http-referrer="$REFERER" --play-and-exit ${TITLE:+--meta-title="$TITLE"} "$VIDEO_URL" ${SUB_URL:+:input-slave="$SUB_URL"}
    exit $?
fi

# Convert MSYS/Git Bash path to Windows path for Python
case "$HLS_PROXY" in
    [A-Za-z]:*)
        WIN_PROXY="$HLS_PROXY"
        ;;
    *)
        if command -v cygpath >/dev/null 2>&1; then
            WIN_PROXY="$(cygpath -w "$HLS_PROXY" 2>/dev/null || echo "$HLS_PROXY")"
        else
            WIN_PROXY="$HLS_PROXY"
        fi
        ;;
esac

echo "[aether-vlc] Starting HLS proxy for VLC..." >&2
echo "[aether-vlc] URL: $VIDEO_URL" >&2
echo "[aether-vlc] Referer: $REFERER" >&2

# Build the proxy command
PROXY_CMD=("$PYTHON" "$WIN_PROXY" "$VIDEO_URL" "$REFERER")

if [ -n "$TITLE" ]; then
    PROXY_CMD+=("--title" "$TITLE")
fi

if [ -n "$SUB_URL" ]; then
    PROXY_CMD+=("--sub" "$SUB_URL")
fi

# Unset DISPLAY to prevent Qt/X11 issues on Windows
[ "$DISPLAY" = "needs-to-be-defined" ] && unset DISPLAY

# Run the proxy (it launches VLC and waits for it to exit)
"${PROXY_CMD[@]}"
exit $?
