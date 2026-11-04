#!/bin/sh
# Installs Opai: clones the engine, installs its dependencies, puts `opai` on
# the PATH, and creates the instance. Run it again to update the engine.
#
#   curl -fsSL https://opai.teogoulois.com/install.sh | sh
#
# OPAI_DIR is where the engine goes (default ~/.local/share/opai), OPAI_HOME
# the instance (default ~/.opai).
set -eu

dir=${OPAI_DIR:-$HOME/.local/share/opai}
bin="$HOME/.local/bin"
repo=https://github.com/teo-goulois/opai.git

fail() {
  echo "opai: $*" >&2
  exit 1
}

command -v git > /dev/null 2>&1 || fail "git is missing."
command -v node > /dev/null 2>&1 || fail "node is missing: install Node 24 or later."
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || fail "node $major is too old: Opai runs TypeScript directly and needs Node 24 or later."
command -v pnpm > /dev/null 2>&1 || fail "pnpm is missing: run corepack enable pnpm."

if [ -d "$dir/.git" ]; then
  echo "Updating the engine in $dir"
  git -C "$dir" pull -q --ff-only
else
  echo "Cloning the engine into $dir"
  git clone -q "$repo" "$dir"
fi
pnpm --dir "$dir" install --frozen-lockfile --silent

mkdir -p "$bin"
ln -sf "$dir/opai" "$bin/opai"
case ":$PATH:" in
  *":$bin:"*) ;;
  *) echo "Add $bin to your PATH to run opai." ;;
esac

"$dir/opai" init
