#!/bin/zsh
set -euo pipefail

BASE="$(cd "$(dirname "$0")" && pwd -P)"
RUN_ROOT="$(cd "$(mktemp -d "${TMPDIR:-/tmp}/spool-b0-install-run.XXXXXX")" && pwd -P)"
NODE_BIN="$(dirname "$(command -v node)")"
NPM_BIN="$(dirname "$(command -v npm)")"
CLEAN_HOME="$RUN_ROOT/clean-home"
CLEAN_CACHE="$RUN_ROOT/npm-cache"
NO_GLOBAL_MODULES="$RUN_ROOT/no-global-modules"
DIST="$RUN_ROOT/dist"
EXTRACT="$RUN_ROOT/extract"
INSTALL="$RUN_ROOT/clean-install"

mkdir -p \
  "$CLEAN_HOME" \
  "$CLEAN_CACHE" \
  "$NO_GLOBAL_MODULES" \
  "$DIST" \
  "$EXTRACT" \
  "$INSTALL"

print -r -- "{\"test\":\"run_root\",\"status\":\"INFO\",\"result\":\"$RUN_ROOT\"}"

clean_env=(
  env -i
  "PATH=$NODE_BIN:$NPM_BIN:/usr/bin:/bin"
  "HOME=$CLEAN_HOME"
  "NODE_PATH=$NO_GLOBAL_MODULES"
  "NODE_OPTIONS="
  "npm_config_cache=$CLEAN_CACHE"
  "npm_config_offline=true"
  "npm_config_registry=http://127.0.0.1:9"
  "npm_config_audit=false"
  "npm_config_fund=false"
  "npm_config_update_notifier=false"
  "npm_config_ignore_scripts=true"
  "CI=1"
)

print_result() {
  local name="$1"
  local mode="$2"
  local output="$3"
  node -e '
    const [name, expectedMode, raw] = process.argv.slice(1);
    const value = JSON.parse(raw);
    if (!value.ok || value.startMode !== expectedMode) process.exit(1);
    process.stdout.write(JSON.stringify({
      test: name,
      status: "PASS",
      result: value
    }) + "\n");
  ' "$name" "$mode" "$output"
}

DIRECT_OUTPUT="$("${clean_env[@]}" node --no-global-search-paths \
  "$BASE/pkg/bin/spool-b0-fixture.mjs" \
  --start-mode=direct-source --json)"
print_result direct_source direct-source "$DIRECT_OUTPUT"

PACK_JSON="$("${clean_env[@]}" npm pack \
  --pack-destination "$DIST" \
  --json \
  "$BASE/pkg")"
TARBALL="$(node -e '
  const value = JSON.parse(process.argv[1]);
  if (!Array.isArray(value) || value.length !== 1) process.exit(1);
  process.stdout.write(value[0].filename);
' "$PACK_JSON")"
TARBALL_PATH="$DIST/$TARBALL"
TARBALL_PATH="$(cd "$(dirname "$TARBALL_PATH")" && pwd -P)/$(basename "$TARBALL_PATH")"

node -e '
  const value = JSON.parse(process.argv[1]);
  process.stdout.write(JSON.stringify({
    test: "npm_pack_metadata",
    status: "PASS",
    result: {
      filename: value[0].filename,
      size: value[0].size,
      unpackedSize: value[0].unpackedSize,
      files: value[0].files.map((file) => file.path)
    }
  }) + "\n");
' "$PACK_JSON"

TAR_LIST="$(tar -tzf "$TARBALL_PATH")"
if [[ "$TAR_LIST" != *"package/bin/spool-b0-fixture.mjs"* ]] ||
   [[ "$TAR_LIST" != *"package/src/main.mjs"* ]] ||
   [[ "$TAR_LIST" == *"package/package-lock.json"* ]]; then
  print -u2 "Packed file list did not match the expected minimal contents"
  exit 1
fi
print -r -- "{\"test\":\"pack_file_list\",\"status\":\"PASS\",\"result\":$(node -e 'process.stdout.write(JSON.stringify(process.argv[1].split("\n").filter(Boolean)))' "$TAR_LIST")}"

tar -xzf "$TARBALL_PATH" -C "$EXTRACT"
EXTRACT_OUTPUT="$("${clean_env[@]}" node --no-global-search-paths \
  "$EXTRACT/package/bin/spool-b0-fixture.mjs" \
  --start-mode=pack-extract --json)"
print_result pack_extract pack-extract "$EXTRACT_OUTPUT"

cp "$BASE/app/package.json" "$INSTALL/package.json"
"${clean_env[@]}" npm install \
  --prefix "$INSTALL" \
  --ignore-scripts \
  --offline \
  --no-audit \
  --no-fund \
  "$TARBALL_PATH" >/dev/null

INSTALL_OUTPUT="$("${clean_env[@]}" node --no-global-search-paths \
  "$INSTALL/node_modules/spool-b0-install-fixture/bin/spool-b0-fixture.mjs" \
  --start-mode=pack-install-module --json)"
print_result pack_install_module pack-install-module "$INSTALL_OUTPUT"

BIN_OUTPUT="$("${clean_env[@]}" "$INSTALL/node_modules/.bin/spool-b0-fixture" \
  --start-mode=pack-install-bin --json)"
print_result pack_install_bin pack-install-bin "$BIN_OUTPUT"

DEP_TREE="$(cd "$INSTALL" && "${clean_env[@]}" npm ls --all --json)"
node -e '
  const value = JSON.parse(process.argv[1]);
  const root = value.dependencies?.["spool-b0-install-fixture"];
  if (!root || root.dependencies) process.exit(1);
  process.stdout.write(JSON.stringify({
    test: "installed_dependency_tree",
    status: "PASS",
    result: {
      rootPackage: "spool-b0-install-fixture",
      rootVersion: root.version,
      thirdPartyDependencies: 0,
      problems: value.problems ?? []
    }
  }) + "\n");
' "$DEP_TREE"

STANDALONE_OUTPUT="$("${clean_env[@]}" node --no-global-search-paths \
  "$BASE/standalone/spool-fixture.mjs" \
  --start-mode=single-file --json)"
print_result single_file single-file "$STANDALONE_OUTPUT"
