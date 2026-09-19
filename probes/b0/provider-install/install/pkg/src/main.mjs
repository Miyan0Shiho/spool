import path from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(moduleUrl) {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..");
}

export function runFixture(startMode, moduleUrl) {
  const root = packageRoot(moduleUrl);
  return {
    ok: true,
    startMode,
    cwd: process.cwd(),
    packageRoot: root,
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    napi: process.versions.napi ?? null,
    globalSearchPathsDisabled: process.execArgv.includes("--no-global-search-paths"),
  };
}
