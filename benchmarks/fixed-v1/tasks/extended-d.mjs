import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content);
}

const t22 = {
  id: "T22",
  prompt:
    "Start service.py in the background, inspect its output, change app.py from version 1 to version 2 while it runs, then terminate the service group and verify no service process survives. Do not leave generated files.",
  setup(root) {
    write(root, "app.py", "VERSION = 1\n");
    write(
      root,
      "service.py",
      [
        "import time",
        "print('service-ready', flush=True)",
        "while True: time.sleep(1)",
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_service.py",
      [
        "import subprocess",
        "assert 'VERSION = 2' in open('app.py').read()",
        "ps=subprocess.check_output(['ps','-axo','command='],text=True)",
        "import re",
        "pattern=re.compile(r'(^|[/ ])service\\.py( |$)')",
        "assert not any(pattern.search(line) for line in ps.splitlines()), [line for line in ps.splitlines() if pattern.search(line)]",
        "",
      ].join("\n"),
    );
  },
  protected: ["service.py", "evaluate_service.py"],
  allowed: ["app.py"],
  command: ["python3", "evaluate_service.py"],
  gold(root) {
    write(root, "app.py", "VERSION = 2\n");
  },
};

const t23 = {
  id: "T23",
  prompt:
    "Start build.py in the background and, while it runs, change notes.txt from todo to done. Read the job output, wait for completion, and verify dist/result.txt exists. Reap the job.",
  setup(root) {
    write(root, "notes.txt", "todo\n");
    write(
      root,
      "build.py",
      [
        "import os, time",
        "time.sleep(1)",
        "os.makedirs('dist',exist_ok=True)",
        "open('dist/result.txt','w').write('built\\n')",
        "print('build-complete',flush=True)",
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_build.py",
      [
        "import subprocess",
        "assert open('notes.txt').read() == 'done\\n'",
        "assert open('dist/result.txt').read() == 'built\\n'",
        "ps=subprocess.check_output(['ps','-axo','command='],text=True)",
        "import re",
        "pattern=re.compile(r'(^|[/ ])build\\.py( |$)')",
        "assert not any(pattern.search(line) for line in ps.splitlines())",
        "",
      ].join("\n"),
    );
  },
  protected: ["build.py", "evaluate_build.py"],
  allowed: ["notes.txt", "dist"],
  command: ["python3", "evaluate_build.py"],
  gold(root) {
    write(root, "notes.txt", "done\n");
    write(root, "dist/result.txt", "built\n");
  },
};

const t24 = {
  id: "T24",
  prompt:
    "Resume from the interrupted edit: calc.py already contains the intended fix, but verification did not run. Inspect the persisted change, run the test suite, and do not duplicate or rewrite the edit.",
  setup(root) {
    write(
      root,
      "calc.py",
      "def add(a,b):\n    return a + b\n",
    );
    write(
      root,
      "tests/test_calc.py",
      [
        "import unittest",
        "from calc import add",
        "class CalcTest(unittest.TestCase):",
        "    def test_add(self): self.assertEqual(add(2,3),5)",
        "",
      ].join("\n"),
    );
    write(root, ".spool-state.json", '{"lastPhase":"edit","verification":"pending"}\n');
    write(
      root,
      "evaluate_resume.py",
      [
        "import json",
        "state=json.load(open('.spool-state.json'))",
        "assert state['verification'] == 'passed', state",
        "",
      ].join("\n"),
    );
  },
  protected: ["calc.py", "tests/test_calc.py", "evaluate_resume.py"],
  allowed: [".spool-state.json"],
  command: ["python3", "evaluate_resume.py"],
  extraCommand: [["python3", "-m", "unittest", "discover", "-s", "tests", "-v"]],
  gold(root) {
    write(root, ".spool-state.json", '{"lastPhase":"verify","verification":"passed"}\n');
  },
};

const t25 = {
  id: "T25",
  prompt:
    "A background job was interrupted before cleanup. Inspect job.pid and job.log, verify the stored process no longer exists, do not kill unrelated processes, then remove only the stale job artifacts.",
  setup(root) {
    write(root, "job.pid", "999999\n");
    write(root, "job.log", "partial-output\n");
    write(root, "source.txt", "keep\n");
    write(
      root,
      "evaluate_resume_cleanup.py",
      [
        "import os",
        "assert not os.path.exists('job.pid')",
        "assert not os.path.exists('job.log')",
        "assert open('source.txt').read() == 'keep\\n'",
        "",
      ].join("\n"),
    );
  },
  protected: ["source.txt", "evaluate_resume_cleanup.py"],
  allowed: ["job.pid", "job.log"],
  command: ["python3", "evaluate_resume_cleanup.py"],
  gold(root) {
    for (const path of ["job.pid", "job.log"]) {
      try {
        unlinkSync(join(root, path));
      } catch {}
    }
  },
};

export const extendedDTasks = [t22, t23, t24, t25];
