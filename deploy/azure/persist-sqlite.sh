#!/usr/bin/env bash
# ============================================================
# SQLite persistence for scale-to-zero hosting
# ============================================================
# Azure Container Apps stops the container after 30 idle minutes
# and starts a fresh one on the next visit, so the container's own
# disk is empty every time it wakes. SQLite is not safe on the
# mounted Azure Files share (SMB byte-range locking breaks it), so
# the database stays on local disk and this wrapper copies it to
# the share mounted at PERSIST_DIR:
#
#   on start     restore the newest readable snapshot
#   every 60s    snapshot again if a transaction has committed
#   on stop      snapshot once more after the app has exited
#
# Snapshots use SQLite's online backup API, so they are consistent
# while the app is writing. Without PERSIST_DIR (Render, Docker
# Compose) the wrapper simply runs the command it was given.
# ============================================================
set -uo pipefail

persist_dir="${PERSIST_DIR:-}"
if [ -z "$persist_dir" ]; then
  exec "$@"
fi

database="${DATABASE_URL:-/data/codelens.db}"
interval="${PERSIST_INTERVAL_SECONDS:-60}"
stop_timeout="${PERSIST_STOP_TIMEOUT_SECONDS:-40}"
snapshot="$persist_dir/codelens.db"
scratch="${TMPDIR:-/tmp}/codelens-snapshot.db"

log() { echo "[persist] $*"; }

restore() {
  local candidate
  mkdir -p "$(dirname "$database")"
  for candidate in "$snapshot" "$snapshot.prev"; do
    [ -s "$candidate" ] || continue
    if cp "$candidate" "$database.restoring" &&
      [ "$(sqlite3 "$database.restoring" 'PRAGMA quick_check;' 2>/dev/null)" = "ok" ]; then
      mv -f "$database.restoring" "$database"
      log "restored $(stat -c %s "$database") bytes from $candidate"
      return 0
    fi
    log "skipping unreadable snapshot $candidate"
  done
  rm -f "$database.restoring"
  log "no snapshot in $persist_dir yet; starting with a fresh database"
}

# Changes on every commit, in rollback-journal and WAL mode alike.
fingerprint() { stat -c '%y %s' "$database" "$database-wal" 2>/dev/null; }

save() {
  [ -f "$database" ] || return 0
  rm -f "$scratch"
  if ! sqlite3 -cmd ".timeout 10000" "$database" ".backup '$scratch'"; then
    log "snapshot failed: could not back up $database"
    return 1
  fi
  # Copy under a temporary name, then swap, so an interrupted copy never
  # replaces a good snapshot with a torn one.
  if ! cp "$scratch" "$snapshot.partial"; then
    log "snapshot failed: could not write to $persist_dir"
    rm -f "$snapshot.partial" "$scratch"
    return 1
  fi
  if [ -f "$snapshot" ]; then mv -f "$snapshot" "$snapshot.prev"; fi
  mv -f "$snapshot.partial" "$snapshot"
  rm -f "$scratch"
  log "saved $(stat -c %s "$snapshot") bytes to $snapshot"
}

restore

stopping=0
app_pid=
sleep_pid=
stop_deadline=0
request_stop() {
  stopping=1
  stop_deadline=$((SECONDS + stop_timeout))
  log "stop requested; waiting for the app to exit"
  if [ -n "$app_pid" ]; then kill -TERM "$app_pid" 2>/dev/null; fi
  if [ -n "$sleep_pid" ]; then kill "$sleep_pid" 2>/dev/null; fi
}
trap request_stop TERM INT

"$@" &
app_pid=$!

last="$(fingerprint)"
next_save=$((SECONDS + interval))
# Short sleeps so a crashed app is noticed within seconds, not a full interval.
while [ "$stopping" -eq 0 ] && kill -0 "$app_pid" 2>/dev/null; do
  sleep 5 &
  sleep_pid=$!
  wait "$sleep_pid" 2>/dev/null
  sleep_pid=
  [ "$stopping" -eq 0 ] && [ "$SECONDS" -ge "$next_save" ] || continue
  next_save=$((SECONDS + interval))
  current="$(fingerprint)"
  if [ "$current" != "$last" ] && save; then
    last="$current"
  fi
done

# The platform kills the whole container at the end of its grace period, so an
# app that ignores SIGTERM is killed here first, leaving time for the last save.
while kill -0 "$app_pid" 2>/dev/null; do
  if [ "$stopping" -eq 1 ] && [ "$SECONDS" -ge "$stop_deadline" ]; then
    log "app did not exit within ${stop_timeout}s; killing it"
    kill -KILL "$app_pid" 2>/dev/null
  fi
  sleep 1
done
wait "$app_pid"
status=$?

save
exit "$status"
