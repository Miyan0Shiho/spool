import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
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
import { pathToFileURL, fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporaryRoot = realpathSync(
  mkdtempSync(join(tmpdir(), "spool-release-check-")),
);
const sourceDirectory = join(temporaryRoot, "source");
const consumerDirectory = join(temporaryRoot, "consumer");
const workspaceDirectory = join(temporaryRoot, "workspace");
const environment = { ...process.env, LANG: "C", LC_ALL: "C" };

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
  mkdirSync(sourceDirectory);
  mkdirSync(consumerDirectory);
  mkdirSync(workspaceDirectory);
  for (const file of [
    "LICENSE",
    "README.md",
    "package-lock.json",
    "package.json",
    "tsconfig.build.json",
    "tsconfig.json",
  ]) {
    cpSync(join(root, file), join(sourceDirectory, file));
  }
  cpSync(join(root, "bin"), join(sourceDirectory, "bin"), { recursive: true });
  cpSync(join(root, "src"), join(sourceDirectory, "src"), { recursive: true });
  symlinkSync(
    join(root, "node_modules"),
    join(sourceDirectory, "node_modules"),
    "dir",
  );
  writeFileSync(join(workspaceDirectory, "README.md"), "# Installed Smoke\n\n");
  writeFileSync(
    join(consumerDirectory, "package.json"),
    '{"name":"spool-release-consumer","private":true,"version":"0.0.0"}\n',
  );

  const packed = JSON.parse(
    run("npm", [
      "pack",
      "--pack-destination",
      temporaryRoot,
      "--json",
    ], { cwd: sourceDirectory }).stdout,
  );
  const tarball = join(temporaryRoot, packed[0].filename);
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

  const bin = join(consumerDirectory, "node_modules", ".bin", "spool");
  const version = run(bin, ["--version"]);
  const expectedVersion = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  ).version;
  assert.equal(version.stdout, `spool ${expectedVersion}\n`);

  const skillDirectory = join(workspaceDirectory, ".spool", "skills");
  mkdirSync(skillDirectory, { recursive: true });
  writeFileSync(
    join(skillDirectory, "review.md"),
    "Review the installed package.\n",
  );
  const { SkillRegistry } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "extensions",
        "skill-registry.js",
      ),
    ).href
  );
  const { ToolRegistry } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "tools",
        "tool-registry.js",
      ),
    ).href
  );
  const skills = new SkillRegistry(workspaceDirectory);
  const skillResult = await new ToolRegistry([skills.tool()]).invoke(
    "skill",
    { name: "review" },
    { signal: new AbortController().signal },
  );
  assert.equal(skillResult.status, "ok");
  assert.match(skillResult.output.content, /installed package/i);

  const { SqliteEventStore } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "storage",
        "sqlite-store.js",
      ),
    ).href
  );
  const databasePath = join(temporaryRoot, "recovery.sqlite");
  const firstStore = new SqliteEventStore(databasePath);
  const input = firstStore.acceptInput("input-1", "session-1", "recover");
  firstStore.createRun(
    "run-command-1",
    "session-1",
    "run-1",
    input.event.eventId,
  );
  assert.equal(firstStore.claimRun("run-1", "session-1"), true);
  firstStore.close();
  const recovered = new SqliteEventStore(databasePath);
  const recoveredFailure = recovered
    .readEvents("session-1")
    .find((event) => event.type === "run/failed");
  assert.equal(recoveredFailure?.payload.reason, "recovered-interrupted-run");
  recovered.close();

  const { ProcessManager } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "execution",
        "process-manager.js",
      ),
    ).href
  );
  const { Workspace } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "execution",
        "workspace.js",
      ),
    ).href
  );
  const { shellTools } = await import(
    pathToFileURL(
      join(
        consumerDirectory,
        "node_modules",
        "spool",
        "dist",
        "tools",
        "shell-tools.js",
      ),
    ).href
  );
  const manager = new ProcessManager();
  const abortController = new AbortController();
  const shellRunning = new ToolRegistry(shellTools).invoke(
    "shell",
    { command: "sleep 30" },
    {
      processManager: manager,
      signal: abortController.signal,
      workspace: new Workspace(workspaceDirectory),
    },
  );
  setTimeout(() => abortController.abort(), 20);
  const shellResult = await shellRunning;
  assert.equal(shellResult.output.aborted, true);
  assert.equal(manager.list().length, 0);

  let providerCheck = "skipped";
  if (process.env.DEEPSEEK_API_KEY) {
    const realRun = spawnSync(
      bin,
      [
        "run",
        "--headless",
        "--provider",
        "deepseek",
        "--workspace",
        workspaceDirectory,
        "--session",
        join(temporaryRoot, "provider.sqlite"),
        "Read README.md and reply with only its heading text.",
      ],
      {
        cwd: consumerDirectory,
        encoding: "utf8",
        env: environment,
        timeout: 120_000,
      },
    );
    assert.equal(realRun.status, 0, realRun.stderr);
    assert.match(realRun.stdout, /Installed Smoke/);
    providerCheck = "pass";
  }

  console.log(
    JSON.stringify(
      {
        cancellation: "pass",
        packageInstall: "pass",
        projectSkill: "pass",
        provider: providerCheck,
        recovery: "pass",
        version: version.stdout.trim(),
      },
      null,
      2,
    ),
  );
} finally {
  rmSync(temporaryRoot, { force: true, recursive: true });
}
