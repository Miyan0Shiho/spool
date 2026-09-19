import assert from "node:assert/strict";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporaryRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "spool-package-check-")),
);
const sourceDirectory = join(temporaryRoot, "source");
const packDirectory = join(temporaryRoot, "pack");
const consumerDirectory = join(temporaryRoot, "consumer");
const environment = { ...process.env, LANG: "C", LC_ALL: "C" };
mkdirSync(sourceDirectory);
mkdirSync(packDirectory);
mkdirSync(consumerDirectory);
for (const file of [
  "LICENSE",
  "README.md",
  "package-lock.json",
  "package.json",
  "tsconfig.build.json",
  "tsconfig.json",
]) {
  copyFileSync(join(root, file), join(sourceDirectory, file));
}
for (const directory of ["bin", "src"]) {
  cpSync(join(root, directory), join(sourceDirectory, directory), {
    recursive: true,
  });
}
symlinkSync(
  join(root, "node_modules"),
  join(sourceDirectory, "node_modules"),
  "dir",
);
assert.equal(existsSync(join(sourceDirectory, "dist")), false);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    encoding: "utf8",
    env: environment,
  });
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`,
  );
  return result;
}

try {
  const packResult = run("npm", [
    "pack",
    "--pack-destination",
    packDirectory,
    "--json",
  ], { cwd: sourceDirectory });
  assert.equal(existsSync(join(sourceDirectory, "dist")), true);
  const packed = JSON.parse(packResult.stdout);
  assert.equal(packed.length, 1);
  const tarball = join(packDirectory, packed[0].filename);

  writeFileSync(
    join(consumerDirectory, "package.json"),
    `${JSON.stringify(
      {
        name: "spool-package-consumer",
        private: true,
        version: "0.0.0",
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", flag: "w" },
  );
  run("npm", [
    "install",
    "--prefix",
    consumerDirectory,
    "--ignore-scripts",
    "--offline",
    "--no-audit",
    "--no-fund",
    tarball,
  ]);

  const version = run(
    join(consumerDirectory, "node_modules", ".bin", "spool"),
    ["--version"],
  );
  const expectedVersion = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ).version;
  assert.equal(version.stdout, `spool ${expectedVersion}\n`);

  const installed = run("npm", ["ls", "--all", "--json"], {
    cwd: consumerDirectory,
  });
  const dependencyTree = JSON.parse(installed.stdout);
  assert.equal(
    Array.isArray(dependencyTree.problems)
      ? dependencyTree.problems.length === 0
      : dependencyTree.problems == null,
    true,
  );
  assert.equal(
    Object.keys(dependencyTree.dependencies ?? {}).length,
    1,
  );

  const manifest = JSON.parse(
    readFileSync(join(consumerDirectory, "package.json"), "utf8"),
  );
  assert.equal(
    manifest.dependencies.spool.startsWith("file:"),
    true,
  );
  process.stdout.write("PASS package_pack_install\n");
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
