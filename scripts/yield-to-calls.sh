#!/bin/sh
# Freeze GPU-heavy render jobs while a voice call is live, and resume them when it ends.
# A path-trace at 99% GPU made Whisper take 37-43 s to load instead of 4-6 s, and Bogdan hung
# up on a silent call (2026-11-08). SIGSTOP rather than kill: a still takes minutes, and a frozen
# job keeps its work. It does not free the job's VRAM, only its GPU time.
#
# usage: yield-to-calls.sh [PATTERN]   runs until no process matches for IDLE_LIMIT checks (default 1 hour)
PATTERN=${1:-scripts/render-stills\.mjs|test/render-smoke\.mjs}
STATUS=${GPU_SHARE_STATUS:-http://127.0.0.1:11434/gpu-share/status}
CALLD=${CALLD_HEALTH:-http://127.0.0.1:8792/health}

tree() { # the process and all its descendants
  echo "$1"
  for child in $(pgrep -P "$1"); do tree "$child"; done
}
in_call() {
  # Either signal is enough. Unreachable counts as a call: wrongly pausing costs a little time,
  # and wrongly rendering is what broke his call.
  # Leases and voice legs mean someone is on the line. Not call_active or active_calls: both stay
  # true long after a hang-up, while the call's conversation is open, which would freeze a job for hours.
  s=$(curl -s -m 2 "$STATUS") || return 0
  case $s in *'"call_leases":{}'*) ;; *) return 0 ;; esac
  h=$(curl -s -m 2 "$CALLD") || return 0
  case $h in *'"voice_legs":0'*) return 1 ;; esac
  return 0
}

# Only real node processes running the job. A plain `pgrep -f` also matches any shell whose command
# line merely mentions the script: that froze a test shell, and could freeze an agent's.
find_jobs() {
  for pid in $(pgrep -f -- "$PATTERN"); do
    first=$(tr '\0' '\n' < "/proc/$pid/cmdline" 2>/dev/null | head -1)
    case ${first##*/} in node) echo "$pid" ;; esac
  done
}

idle=0
frozen=0
while [ "$idle" -lt "${IDLE_LIMIT:-1800}" ]; do
  roots=$(find_jobs)
  if [ -z "$roots" ]; then
    idle=$((idle + 1))
    frozen=0
  else
    idle=0
    if in_call; then
      for r in $roots; do kill -STOP $(tree "$r") 2>/dev/null; done
      [ "$frozen" = 1 ] || echo "$(date +%T) call live: froze render"
      frozen=1
    elif [ "$frozen" = 1 ]; then
      for r in $roots; do kill -CONT $(tree "$r") 2>/dev/null; done
      echo "$(date +%T) call over: resumed render"
      frozen=0
    fi
  fi
  sleep 2
done
