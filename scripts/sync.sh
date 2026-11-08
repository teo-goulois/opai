#!/bin/sh
# Syncs the instance (OPAI_HOME, ~/.opai by default) with its Git remote:
# records this machine's skill uses and the skills it has not shared, commits
# what agents wrote (spaces/*/agents/), rebases this machine's commits on
# origin/main, then pushes. What you change yourself (rules, config) is never
# committed here: you commit it, and the next run pushes it.
#
#   opai sync              sync once
#   opai sync --install    sync every 10 minutes with launchd (macOS)
#   opai sync --uninstall  stop syncing automatically
#
# Offline, it only commits; a later run sends everything. A conflict, or a
# secret blocked by the pre-commit hook, stops it with a notification: nothing
# is lost, but it waits for you.
set -u

engine=$(cd "$(dirname "$0")/.." && pwd)
root=${OPAI_HOME:-$HOME/.opai}
node=${OPAI_NODE:-$(command -v node || true)}
label=dev.opai.sync
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/opai/sync.log"
machine=$(hostname -s)

# Don't let a dead connection hang a run.
export GIT_HTTP_LOW_SPEED_LIMIT=1000 GIT_HTTP_LOW_SPEED_TIME=30

say() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*"; }

# Stops the sync. The notification is only for what needs you.
fail() {
  say "Stopped: $*"
  if command -v osascript > /dev/null 2>&1; then
    osascript -e "display notification \"$*\" with title \"Opai sync stopped\"" > /dev/null 2>&1
  fi
  exit 1
}

install() {
  mkdir -p "${log%/*}" "${plist%/*}"
  cat > "$plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/env</string>
    <string>-i</string>
    <string>HOME=$HOME</string>
    <string>PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <string>OPAI_HOME=$root</string>
    <string>OPAI_NODE=$node</string>
    <string>$engine/scripts/sync.sh</string>
  </array>
  <key>StartInterval</key>
  <integer>600</integer>
  <key>RunAtLoad</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>$log</string>
  <key>StandardErrorPath</key>
  <string>$log</string>
</dict>
</plist>
EOF
  launchctl bootout "gui/$(id -u)/$label" 2> /dev/null
  launchctl bootstrap "gui/$(id -u)" "$plist" || exit 1
  echo "Syncing $root every 10 minutes. Log: $log"
}

case "${1:-}" in
  --install) install; exit ;;
  --uninstall)
    launchctl bootout "gui/$(id -u)/$label" 2> /dev/null
    rm -f "$plist"
    echo "Stopped syncing automatically."
    exit
    ;;
  "") ;;
  *) echo "Usage: $0 [--install | --uninstall]" >&2; exit 2 ;;
esac

cd "$root" || fail "$root is missing."

# One sync at a time. A lock left by a crashed run is taken over.
lock="$root/.local/sync.lock"
mkdir -p "$root/.local"
if ! mkdir "$lock" 2> /dev/null; then
  pid=$(cat "$lock/pid" 2> /dev/null)
  if [ -n "$pid" ] && kill -0 "$pid" 2> /dev/null; then exit 0; fi
  rm -rf "$lock"
  mkdir "$lock" 2> /dev/null || exit 0
fi
echo $$ > "$lock/pid"
trap 'rm -rf "$lock"' EXIT

git_dir=$(git rev-parse --git-dir) || fail "$root is not a Git repository."
for busy in rebase-merge rebase-apply MERGE_HEAD; do
  [ -e "$git_dir/$busy" ] && fail "A rebase or merge is in progress in $root. Finish it by hand."
done
branch=$(git symbolic-ref -q --short HEAD)
if [ "$branch" != main ]; then
  say "Skipped: $root is on ${branch:-a detached HEAD}, not main."
  exit 0
fi

# 1. Copy the skill uses of this machine's sessions into spaces/*/agents/usage/.
#    Claude deletes its sessions after 30 days; these lines stay. A failure
#    only skips this run's uses: the next run finds them again.
if [ -n "$node" ]; then
  OPAI_HOME="$root" "$node" "$engine/packages/context/src/usage.ts" collect > /dev/null 2>&1 ||
    say "Could not collect skill uses."
  # The skills this machine has not shared, for the other machines to see
  # (machines.ts). Written only when they change.
  OPAI_HOME="$root" "$node" "$engine/packages/context/src/machines.ts" report > /dev/null 2>&1 ||
    say "Could not report this machine's state."
fi

# 2. Commit what agents wrote, and only that. Anything you staged by hand stays
#    out of this commit.
set -- spaces/*/agents
if [ -e "$1" ]; then
  git add -A -- "$@"
  if ! git diff --cached --quiet -- "$@"; then
    count=$(git diff --cached --name-only -- "$@" | wc -l | tr -d ' ')
    subject="Agents on $machine: $(git diff --cached --name-only -- "$@" | head -1)"
    [ "$count" -gt 1 ] && subject="$subject and $((count - 1)) more"
    files=$(git diff --cached --name-status -- "$@" | head -100)
    if ! git commit -q -m "$subject" -m "$files" -- "$@"; then
      git reset -q -- "$@"
      fail "Commit failed: a secret found by gitleaks, or a Git error. See $log."
    fi
    say "Committed: $subject"
  fi
fi

# 3. Get the remote's changes. Offline is normal: retry on the next run.
if ! git fetch -q origin main; then
  say "Remote unreachable: changes stay committed here until the next run."
  exit 0
fi

# 4. Put this machine's commits on top of the remote's. Your uncommitted changes are
#    set aside and put back.
incoming=$(git rev-list --count HEAD..origin/main)
if [ "$incoming" -gt 0 ]; then
  if ! git rebase -q --autostash origin/main; then
    git rebase --abort
    fail "Conflict with the remote. Nothing is lost: rebase $root on origin/main by hand."
  fi
  say "Pulled $incoming commits."
fi

# 5. Send this machine's commits, yours and the agents'.
outgoing=$(git rev-list --count origin/main..HEAD)
if [ "$outgoing" -gt 0 ]; then
  if ! git push -q origin HEAD:main; then
    say "Push failed: retrying on the next run."
    exit 0
  fi
  say "Pushed $outgoing commits."
fi
