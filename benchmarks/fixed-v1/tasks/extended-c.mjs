import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, LANG: "C", LC_ALL: "C" },
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

const t16 = {
  id: "T16",
  prompt:
    "Repair the local lockfile mismatch using only the cached tarball. Update the manifest and lockfile to the authoritative cached version, then run the offline install and tests. Do not edit the cache.",
  setup(root) {
    write(
      root,
      "dep-src/package.json",
      '{"name":"fixture-dep","version":"1.2.1","main":"index.js"}\n',
    );
    write(root, "dep-src/index.js", "module.exports = () => 'fixture-ok';\n");
    mkdirSync(join(root, ".cache"), { recursive: true });
    run(
      "npm",
      [
        "pack",
        "--pack-destination",
        join(root, ".cache"),
        join(root, "dep-src"),
      ],
      root,
    );
    const tarball = join(root, ".cache", "fixture-dep-1.2.1.tgz");
    const integrity = `sha512-${createHash("sha512")
      .update(readFileSync(tarball))
      .digest("base64")}`;
    write(
      root,
      "package.json",
      `${JSON.stringify(
        {
          dependencies: { "fixture-dep": "1.2.0" },
          name: "lock-fixture",
          private: true,
          scripts: {
            test: "node -e \"const dep=require('fixture-dep');if(dep()!=='fixture-ok')process.exit(1)\"",
          },
        },
        null,
        2,
      )}\n`,
    );
    write(
      root,
      "package-lock.json",
      `${JSON.stringify(
        {
          lockfileVersion: 3,
          name: "lock-fixture",
          packages: {
            "": {
              dependencies: { "fixture-dep": "1.2.0" },
              name: "lock-fixture",
            },
            "node_modules/fixture-dep": {
              integrity,
              resolved: "file:.cache/fixture-dep-1.2.1.tgz",
              version: "1.2.1",
            },
          },
          requires: true,
          version: "1.0.0",
        },
        null,
        2,
      )}\n`,
    );
  },
  protected: [".cache/fixture-dep-1.2.1.tgz"],
  allowed: ["package.json", "package-lock.json", "node_modules"],
  command: ["npm", "ci", "--offline", "--no-audit", "--no-fund"],
  extraCommand: [["npm", "test"]],
  gold(root) {
    const manifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    );
    manifest.dependencies["fixture-dep"] = "1.2.1";
    write(root, "package.json", `${JSON.stringify(manifest, null, 2)}\n`);
    const lock = JSON.parse(
      readFileSync(join(root, "package-lock.json"), "utf8"),
    );
    lock.packages[""].dependencies["fixture-dep"] = "1.2.1";
    write(root, "package-lock.json", `${JSON.stringify(lock, null, 2)}\n`);
  },
};

const t17 = {
  id: "T17",
  prompt:
    "Repair the Python packaging metadata so the ledger package is discovered and the ledgerctl console command points to a real module. Verify with an isolated offline install.",
  setup(root) {
    write(root, "ledger/__init__.py", "__version__='1.0.0'\n");
    write(
      root,
      "ledger/cli.py",
      "def main():\n    print('ledger-ok')\n    return 0\n",
    );
    write(
      root,
      "pyproject.toml",
      [
        "[build-system]",
        'requires = ["setuptools>=68"]',
        'build-backend = "setuptools.build_meta"',
        "",
        "[project]",
        'name = "ledger-fixture"',
        'version = "1.0.0"',
        "",
        "[project.scripts]",
        'ledgerctl = "ledger.missing:main"',
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_packaging.py",
      [
        "import glob, os, shutil, subprocess, sys, tempfile",
        "from pathlib import Path",
        "try:",
        "    with tempfile.TemporaryDirectory() as target:",
        "        install=subprocess.run([sys.executable,'-m','pip','install','--no-index','--no-deps','--no-build-isolation','--target',target,'.'],capture_output=True,text=True)",
        "        assert install.returncode == 0, install.stderr",
        "        env={**os.environ,'PYTHONPATH':target}",
        "        imported=subprocess.run([sys.executable,'-c','import ledger; print(ledger.__version__)'],env=env,capture_output=True,text=True)",
        "        assert imported.returncode == 0 and imported.stdout.strip() == '1.0.0', imported.stderr",
        "        candidate=Path(target)/'bin'/'ledgerctl'",
        "        assert candidate.exists(), list(Path(target).rglob('*'))",
        "        command=subprocess.run([str(candidate)],env=env,capture_output=True,text=True)",
        "        assert command.returncode == 0 and command.stdout.strip() == 'ledger-ok', command.stderr",
        "finally:",
        "    shutil.rmtree('build', ignore_errors=True)",
        "    for path in glob.glob('*.egg-info'): shutil.rmtree(path, ignore_errors=True)",
        "",
      ].join("\n"),
    );
  },
  protected: ["ledger/__init__.py", "ledger/cli.py", "evaluate_packaging.py"],
  allowed: ["pyproject.toml", "setup.cfg", "setup.py", "ledger"],
  command: ["python3", "evaluate_packaging.py"],
  gold(root) {
    const metadata = readFileSync(join(root, "pyproject.toml"), "utf8");
    write(
      root,
      "pyproject.toml",
      metadata.replace("ledger.missing:main", "ledger.cli:main"),
    );
  },
};

export const extendedCTasks = [t16, t17];
