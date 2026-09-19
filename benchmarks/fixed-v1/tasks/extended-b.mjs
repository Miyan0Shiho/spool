import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content);
}

const t10 = {
  id: "T10",
  prompt:
    "Extract the duplicated request validation in api/users.py and api/orders.py into one internal helper. Preserve public functions, validation order, and exact error messages. Do not modify tests.",
  setup(root) {
    write(root, "api/__init__.py", "");
    write(
      root,
      "api/users.py",
      [
        "def create_user(name):",
        "    if not isinstance(name, str): raise TypeError('name must be str')",
        "    if not name: raise ValueError('name required')",
        "    return {'name': name}",
        "",
      ].join("\n"),
    );
    write(
      root,
      "api/orders.py",
      [
        "def create_order(name):",
        "    if not isinstance(name, str): raise TypeError('name must be str')",
        "    if not name: raise ValueError('name required')",
        "    return {'name': name}",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_api.py",
      [
        "import unittest",
        "from api.users import create_user",
        "from api.orders import create_order",
        "class ApiTest(unittest.TestCase):",
        "    def test_users(self): self.assertEqual(create_user('a'), {'name':'a'})",
        "    def test_orders(self): self.assertEqual(create_order('b'), {'name':'b'})",
        "    def test_invalid_type(self):",
        "        with self.assertRaisesRegex(TypeError, '^name must be str$'): create_user(1)",
        "    def test_empty(self):",
        "        with self.assertRaisesRegex(ValueError, '^name required$'): create_order('')",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_api.py"],
  allowed: ["api"],
  command: ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
  gold(root) {
    write(
      root,
      "api/validation.py",
      [
        "def require_name(name):",
        "    if not isinstance(name, str): raise TypeError('name must be str')",
        "    if not name: raise ValueError('name required')",
        "",
      ].join("\n"),
    );
    write(root, "api/users.py", "from .validation import require_name\n\ndef create_user(name): require_name(name); return {'name': name}\n");
    write(root, "api/orders.py", "from .validation import require_name\n\ndef create_order(name): require_name(name); return {'name': name}\n");
  },
};

const t11 = {
  id: "T11",
  prompt:
    "Switch the application from the obsolete memory adapter to the existing JSON store adapter. Preserve the on-disk JSON bytes and recovery behavior; do not migrate or rewrite golden data.",
  setup(root) {
    write(root, "storage/__init__.py", "");
    write(root, "storage/memory.py", "class MemoryStore:\n    def __init__(self): self.items=[]\n");
    write(
      root,
      "storage/json_store.py",
      [
        "import json",
        "class JsonStore:",
        "    def __init__(self,path): self.path=path",
        "    def append(self,item):",
        "        rows=json.load(open(self.path,encoding='utf-8')) if __import__('os').path.exists(self.path) else []",
        "        rows.append(item)",
        "        open(self.path,'w',encoding='utf-8').write(json.dumps(rows,separators=(',',':'))+'\\n')",
        "",
      ].join("\n"),
    );
    write(root, "app.py", "from storage.memory import MemoryStore\nstore=MemoryStore()\n");
    write(root, "golden.json", '[{"id":1}]\n');
    write(
      root,
      "tests/test_storage.py",
      [
        "import json, tempfile, unittest",
        "from pathlib import Path",
        "from storage.json_store import JsonStore",
        "class StorageTest(unittest.TestCase):",
        "    def test_recovery(self):",
        "        with tempfile.TemporaryDirectory() as root:",
        "            path=Path(root)/'data.json'",
        "            JsonStore(path).append({'id':1}); JsonStore(path).append({'id':2})",
        "            self.assertEqual(json.loads(path.read_text()), [{'id':1},{'id':2}])",
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_storage.py",
      [
        "from pathlib import Path",
        "assert Path('golden.json').read_bytes() == b'[{\"id\":1}]\\n'",
        "source=Path('app.py').read_text()",
        "assert 'JsonStore' in source and 'MemoryStore' not in source",
        "",
      ].join("\n"),
    );
  },
  protected: ["golden.json", "tests/test_storage.py", "evaluate_storage.py"],
  allowed: ["app.py", "storage"],
  command: ["python3", "-m", "unittest", "discover", "-s", "tests", "-v"],
  extraCommand: [["python3", "evaluate_storage.py"]],
  gold(root) {
    write(root, "app.py", "from storage.json_store import JsonStore\nstore=JsonStore('data.json')\n");
  },
};

const t12 = {
  id: "T12",
  prompt:
    "Centralize the duplicated path normalization in paths/ while preserving workspace-root rejection, symlink handling, and exact error messages. Do not weaken containment.",
  setup(root) {
    write(root, "paths/__init__.py", "");
    write(
      root,
      "paths/normalize.py",
      [
        "import os",
        "def normalize_read(root,path):",
        "    root=os.path.realpath(root); value=os.path.realpath(os.path.join(root,path))",
        "    if value != root and not value.startswith(root+os.sep): raise ValueError('path escapes workspace')",
        "    return value",
        "def normalize_write(root,path):",
        "    root=os.path.realpath(root); value=os.path.realpath(os.path.join(root,path))",
        "    if value != root and not value.startswith(root+os.sep): raise ValueError('path escapes workspace')",
        "    return value",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_paths.py",
      [
        "import os, tempfile, unittest",
        "from pathlib import Path",
        "from paths.normalize import normalize_read, normalize_write",
        "class PathTest(unittest.TestCase):",
        "    def test_inside(self):",
        "        with tempfile.TemporaryDirectory() as root:",
        "            self.assertEqual(normalize_read(root,'a'), os.path.realpath(str(Path(root)/'a')))",
        "    def test_escape(self):",
        "        with tempfile.TemporaryDirectory() as root:",
        "            with self.assertRaisesRegex(ValueError,'^path escapes workspace$'): normalize_write(root,'../x')",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_paths.py"],
  allowed: ["paths"],
  command: ["python3", "-m", "unittest", "tests.test_paths", "-v"],
  gold(root) {
    write(
      root,
      "paths/normalize.py",
      [
        "import os",
        "def _normalize(root,path):",
        "    root=os.path.realpath(root); value=os.path.realpath(os.path.join(root,path))",
        "    if value != root and not value.startswith(root+os.sep): raise ValueError('path escapes workspace')",
        "    return value",
        "def normalize_read(root,path): return _normalize(root,path)",
        "def normalize_write(root,path): return _normalize(root,path)",
        "",
      ].join("\n"),
    );
  },
};

const t13 = {
  id: "T13",
  prompt:
    "Add focused interval-parser tests for empty input, zero-length ranges, whitespace, reversed bounds, and inclusive endpoints. Do not change production code.",
  setup(root) {
    write(root, "intervals.py", "def parse(value):\n    return tuple(int(part.strip()) for part in value.split('-'))\n");
    write(
      root,
      "tests/test_intervals.py",
      [
        "import unittest",
        "from intervals import parse",
        "class IntervalTest(unittest.TestCase):",
        "    def test_basic(self): self.assertEqual(parse('1-3'), (1,3))",
        "    def test_inclusive(self): self.assertEqual(parse('4-4'), (4,4))",
        "",
      ].join("\n"),
    );
  },
  protected: ["intervals.py"],
  allowed: ["tests"],
  command: ["python3", "-m", "unittest", "tests.test_intervals", "-v"],
  gold(root) {
    write(
      root,
      "tests/test_intervals.py",
      [
        "import unittest",
        "from intervals import parse",
        "class IntervalTest(unittest.TestCase):",
        "    def test_basic(self): self.assertEqual(parse('1-3'), (1,3))",
        "    def test_zero(self): self.assertEqual(parse('4-4'), (4,4))",
        "    def test_whitespace(self): self.assertEqual(parse(' 2 - 5 '), (2,5))",
        "    def test_reversed(self): self.assertEqual(parse('9-2'), (9,2))",
        "    def test_invalid_empty(self):",
        "        with self.assertRaises(ValueError): parse('')",
        "",
      ].join("\n"),
    );
  },
};

const t14 = {
  id: "T14",
  prompt:
    "Add a regression test proving serve(root, requested) rejects '..', absolute paths, and an escaping symlink while serving an in-root file. Do not change production code.",
  setup(root) {
    write(
      root,
      "serving.py",
      [
        "import os",
        "def serve(root, requested):",
        "    root=os.path.realpath(root); value=os.path.realpath(os.path.join(root,requested))",
        "    if value != root and not value.startswith(root+os.sep): raise ValueError('escape')",
        "    return open(value,encoding='utf-8').read()",
        "",
      ].join("\n"),
    );
    write(root, "tests/test_serving_security.py", "import unittest\nclass Placeholder(unittest.TestCase):\n    def test_placeholder(self): self.assertTrue(True)\n");
  },
  protected: ["serving.py"],
  allowed: ["tests"],
  command: ["python3", "-m", "unittest", "tests.test_serving_security", "-v"],
  extraCommand: [["python3", "-c", "assert True"]],
  gold(root) {
    write(
      root,
      "tests/test_serving_security.py",
      [
        "import os, tempfile, unittest",
        "from pathlib import Path",
        "from serving import serve",
        "class SecurityTest(unittest.TestCase):",
        "    def test_vectors(self):",
        "        with tempfile.TemporaryDirectory() as root, tempfile.TemporaryDirectory() as outside:",
        "            root=Path(root); Path(root/'ok.txt').write_text('ok')",
        "            outside=Path(outside); Path(outside/'secret.txt').write_text('secret')",
        "            os.symlink(Path(outside/'secret.txt'), root/'link')",
        "            self.assertEqual(serve(str(root),'ok.txt'),'ok')",
        "            for value in ('../secret.txt','/etc/passwd','link'):",
        "                with self.assertRaises(ValueError): serve(str(root),value)",
        "",
      ].join("\n"),
    );
  },
};

const t15 = {
  id: "T15",
  prompt:
    "Add a deterministic test that runner.cancel_process_group cancels a sleeping child group, reports cancellation, and retains partial output. Do not change production code.",
  setup(root) {
    write(
      root,
      "runner.py",
      [
        "import os, signal, subprocess, time",
        "class Handle:",
        "    def __init__(self,process): self.process=process; self.output=''",
        "    def cancel(self):",
        "        os.killpg(self.process.pid, signal.SIGTERM)",
        "        try: self.output += self.process.stdout.read() or ''",
        "        finally: self.process.wait(timeout=2)",
        "        return {'cancelled': True, 'output': self.output}",
        "def start(command):",
        "    process=subprocess.Popen(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,preexec_fn=os.setsid)",
        "    time.sleep(0.05)",
        "    return Handle(process)",
        "",
      ].join("\n"),
    );
    write(root, "tests/test_runner_cancel.py", "import unittest\nclass Placeholder(unittest.TestCase):\n    def test_placeholder(self): self.assertTrue(True)\n");
  },
  protected: ["runner.py"],
  allowed: ["tests"],
  command: ["python3", "-m", "unittest", "tests.test_runner_cancel", "-v"],
  gold(root) {
    write(
      root,
      "tests/test_runner_cancel.py",
      [
        "import sys, unittest",
        "from runner import start",
        "class CancelTest(unittest.TestCase):",
        "    def test_cancel(self):",
        "        handle=start([sys.executable,'-c',\"import time; print('partial',flush=True); time.sleep(30)\"])",
        "        result=handle.cancel()",
        "        self.assertTrue(result['cancelled'])",
        "        self.assertIn('partial', result['output'])",
        "",
      ].join("\n"),
    );
  },
};

export const extendedBTasks = [t10, t11, t12, t13, t14, t15];
