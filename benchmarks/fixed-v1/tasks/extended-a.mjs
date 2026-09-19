import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

function write(root, path, content) {
  const absolute = join(root, path);
  mkdirSync(join(absolute, ".."), { recursive: true });
  writeFileSync(absolute, content);
}

const t04 = {
  id: "T04",
  prompt:
    "Add `python -m ledger totals <csv>` using the existing reader/formatting modules. Preserve the list command, output totals with two decimals, and reject malformed numeric rows with a nonzero exit.",
  setup(root) {
    write(root, "ledger/__init__.py", "");
    write(root, "ledger/__main__.py", "from .cli import main\nraise SystemExit(main())\n");
    write(
      root,
      "ledger/csv_reader.py",
      [
        "import csv",
        "",
        "def read_rows(path):",
        '    with open(path, newline="", encoding="utf-8") as handle:',
        "        return list(csv.DictReader(handle))",
        "",
      ].join("\n"),
    );
    write(
      root,
      "ledger/formatting.py",
      ["def format_amount(value):", '    return f"{value:.2f}"', ""].join("\n"),
    );
    write(
      root,
      "ledger/cli.py",
      [
        "import sys",
        "from .csv_reader import read_rows",
        "from .formatting import format_amount",
        "",
        "def main(argv=None):",
        "    argv = list(sys.argv[1:] if argv is None else argv)",
        "    if not argv or argv[0] != 'list' or len(argv) != 2:",
        "        return 2",
        "    for row in read_rows(argv[1]):",
        "        print(f\"{row.get('name', '')} {format_amount(float(row['amount']))}\")",
        "    return 0",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_list.py",
      [
        "import subprocess",
        "import sys",
        "import unittest",
        "from pathlib import Path",
        "",
        "class ListTest(unittest.TestCase):",
        "    def test_list(self):",
        '        path = Path(__file__).parent / "data.csv"',
        '        result = subprocess.run([sys.executable, "-m", "ledger", "list", str(path)], capture_output=True, text=True, check=True)',
        '        self.assertIn("A 1.00", result.stdout)',
        "",
      ].join("\n"),
    );
    write(root, "tests/data.csv", "name,amount\nA,1\nB,2\n");
    write(
      root,
      "evaluate_totals.py",
      [
        "import subprocess, sys, tempfile",
        "from pathlib import Path",
        "root = Path(__file__).parent",
        "good = subprocess.run([sys.executable, '-m', 'ledger', 'totals', str(root / 'tests/data.csv')], cwd=root, capture_output=True, text=True)",
        "assert good.returncode == 0, good.stderr",
        "assert good.stdout.strip() == '3.00', good.stdout",
        "with tempfile.NamedTemporaryFile('w', suffix='.csv', delete=False, dir='/private/tmp') as handle:",
        "    handle.write('name,amount\\nA,nope\\n')",
        "    bad_path = handle.name",
        "bad = subprocess.run([sys.executable, '-m', 'ledger', 'totals', bad_path], cwd=root, capture_output=True, text=True)",
        "assert bad.returncode != 0",
        "listed = subprocess.run([sys.executable, '-m', 'ledger', 'list', str(root / 'tests/data.csv')], cwd=root, capture_output=True, text=True)",
        "assert listed.returncode == 0 and 'A 1.00' in listed.stdout",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_list.py", "tests/data.csv"],
  allowed: ["ledger", "tests", "README.md"],
  command: ["python3", "evaluate_totals.py"],
  gold(root) {
    write(
      root,
      "ledger/cli.py",
      [
        "import sys",
        "from .csv_reader import read_rows",
        "from .formatting import format_amount",
        "",
        "def main(argv=None):",
        "    argv = list(sys.argv[1:] if argv is None else argv)",
        "    if len(argv) != 2:",
        "        return 2",
        "    rows = read_rows(argv[1])",
        "    if argv[0] == 'list':",
        "        for row in rows:",
        "            print(f\"{row.get('name', '')} {format_amount(float(row['amount']))}\")",
        "        return 0",
        "    if argv[0] == 'totals':",
        "        try:",
        "            total = sum(float(row['amount']) for row in rows)",
        "        except (KeyError, ValueError) as error:",
        "            print(f'invalid amount: {error}', file=sys.stderr)",
        "            return 1",
        "        print(format_amount(total))",
        "        return 0",
        "    return 2",
        "",
      ].join("\n"),
    );
  },
};

const t05 = {
  id: "T05",
  prompt:
    "Add opt-in bounded retries for HTTP 503 and connection resets to src/client.js. Preserve one-attempt default behavior, do not retry 400 responses, and keep the existing call signature.",
  setup(root) {
    write(root, "package.json", '{"name":"retry-fixture","private":true}\n');
    write(root, "src/config.js", "module.exports = { defaultRetries: 0 };\n");
    write(root, "src/errors.js", "class HttpError extends Error {}\nmodule.exports = { HttpError };\n");
    write(
      root,
      "src/client.js",
      [
        "const { HttpError } = require('./errors');",
        "async function request(url, options = {}, fetchImpl = fetch) {",
        "  const response = await fetchImpl(url, options);",
        "  if (!response.ok) throw new HttpError(String(response.status));",
        "  return { attempts: 1, body: await response.text() };",
        "}",
        "module.exports = { request };",
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_retry.mjs",
      [
        "import assert from 'node:assert/strict';",
        "import http from 'node:http';",
        "import { createRequire } from 'node:module';",
        "const require=createRequire(import.meta.url);",
        "const { request }=require('./src/client.js');",
        "let calls=0; const server=http.createServer((req,res)=>{calls++; if(calls<3){res.writeHead(503);res.end('busy')}else{res.end('ok')}});",
        "await new Promise(r=>server.listen(0,'127.0.0.1',r));",
        "const url=`http://127.0.0.1:${server.address().port}`;",
        "const result=await request(url,{retries:3});",
        "assert.equal(calls,3); assert.equal(result.attempts,3); assert.equal(result.body,'ok');",
        "await new Promise(r=>server.close(r));",
        "let badCalls=0; const bad=http.createServer((req,res)=>{badCalls++;res.writeHead(400);res.end('bad')});",
        "await new Promise(r=>bad.listen(0,'127.0.0.1',r));",
        "await assert.rejects(request(`http://127.0.0.1:${bad.address().port}`,{retries:3}));",
        "assert.equal(badCalls,1); await new Promise(r=>bad.close(r));",
        "",
      ].join("\n"),
    );
  },
  protected: ["evaluate_retry.mjs"],
  allowed: ["src", "tests", "config.example.json"],
  command: ["node", "evaluate_retry.mjs"],
  gold(root) {
    write(
      root,
      "src/client.js",
      [
        "const { HttpError } = require('./errors');",
        "async function request(url, options = {}, fetchImpl = fetch) {",
        "  const retries = Math.max(0, options.retries ?? 0);",
        "  let attempts = 0;",
        "  while (true) {",
        "    attempts += 1;",
        "    try {",
        "      const response = await fetchImpl(url, options);",
        "      if (!response.ok) {",
        "        const error = new HttpError(String(response.status));",
        "        error.status = response.status;",
        "        throw error;",
        "      }",
        "      return { attempts, body: await response.text() };",
        "    } catch (error) {",
        "      const status = error.status;",
        "      const retryable = status === 503 || error.code === 'ECONNRESET';",
        "      if (!retryable || attempts > retries) throw error;",
        "    }",
        "  }",
        "}",
        "module.exports = { request };",
        "",
      ].join("\n"),
    );
  },
};

const t06 = {
  id: "T06",
  prompt:
    "Add `--format json` to the inventory CLI while preserving the default text output. JSON must be stable, parseable stdout, and errors must remain on stderr with nonzero exit.",
  setup(root) {
    write(root, "inventory/__init__.py", "");
    write(root, "inventory/__main__.py", "from .cli import main\nraise SystemExit(main())\n");
    write(root, "inventory/errors.py", "class InventoryError(Exception): pass\n");
    write(root, "inventory/render.py", "def render_text(items):\n    return '\\n'.join(f\"{i['name']} {i['count']}\" for i in items)\n");
    write(
      root,
      "inventory/cli.py",
      [
        "import json, sys",
        "from .render import render_text",
        "",
        "def main(argv=None):",
        "    argv = list(sys.argv[1:] if argv is None else argv)",
        "    items = [{'name': 'apples', 'count': 2}, {'name': 'pears', 'count': 1}]",
        "    if argv == ['list']:",
        "        print(render_text(items))",
        "        return 0",
        "    return 2",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_text.py",
      [
        "import subprocess, sys, unittest",
        "class TextTest(unittest.TestCase):",
        "    def test_text(self):",
        "        result=subprocess.run([sys.executable,'-m','inventory','list'],capture_output=True,text=True,check=True)",
        "        self.assertEqual(result.stdout.strip().splitlines()[0],'apples 2')",
        "",
      ].join("\n"),
    );
    write(
      root,
      "evaluate_inventory.py",
      [
        "import json, subprocess, sys",
        "text=subprocess.run([sys.executable,'-m','inventory','list'],capture_output=True,text=True)",
        "assert text.returncode==0 and text.stdout.startswith('apples 2')",
        "data=subprocess.run([sys.executable,'-m','inventory','list','--format','json'],capture_output=True,text=True)",
        "assert data.returncode==0, data.stderr",
        "assert json.loads(data.stdout)==[{'name':'apples','count':2},{'name':'pears','count':1}]",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_text.py"],
  allowed: ["inventory", "tests"],
  command: ["python3", "evaluate_inventory.py"],
  gold(root) {
    write(
      root,
      "inventory/cli.py",
      [
        "import json, sys",
        "from .render import render_text",
        "",
        "def main(argv=None):",
        "    argv = list(sys.argv[1:] if argv is None else argv)",
        "    items = [{'name': 'apples', 'count': 2}, {'name': 'pears', 'count': 1}]",
        "    if argv[:1] == ['list'] and argv[1:] in ([], ['--format','json']):",
        "        if argv[1:]: print(json.dumps(items, separators=(',', ':')))",
        "        else: print(render_text(items))",
        "        return 0",
        "    return 2",
        "",
      ].join("\n"),
    );
  },
};

const t07 = {
  id: "T07",
  prompt:
    "Fix the multiline log parser so blank lines terminate and emit the current record. Keep malformed records failing as before and do not weaken validation.",
  setup(root) {
    write(root, "logparse/__init__.py", "");
    write(
      root,
      "logparse/parser.py",
      [
        "def parse_records(text):",
        "    records=[]; current=[]",
        "    for line in text.splitlines():",
        "        if not line.strip():",
        "            current=[]",
        "            continue",
        "        if line == 'bad': raise ValueError('malformed record')",
        "        current.append(line)",
        "    if current: records.append('\\n'.join(current))",
        "    return records",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_log_parser.py",
      [
        "import unittest",
        "from logparse.parser import parse_records",
        "class ParserTest(unittest.TestCase):",
        "    def test_blank_boundary(self):",
        "        self.assertEqual(parse_records('a\\nb\\n\\nc'), ['a\\nb','c'])",
        "    def test_malformed_rejected(self):",
        "        with self.assertRaises(ValueError):",
        "            parse_records('bad')",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_log_parser.py"],
  allowed: ["logparse", "tests"],
  command: ["python3", "-m", "unittest", "tests.test_log_parser", "-v"],
  gold(root) {
    write(
      root,
      "logparse/parser.py",
      [
        "def parse_records(text):",
        "    records=[]; current=[]",
        "    for line in text.splitlines()+['']:",
        "        if not line.strip():",
        "            if current:",
        "                record='\\n'.join(current); current=[]",
                "                records.append(record)",
        "            continue",
        "        if line == 'bad': raise ValueError('malformed record')",
        "        current.append(line)",
        "    return records",
        "",
      ].join("\n"),
    );
  },
};

const t08 = {
  id: "T08",
  prompt:
    "Fix schedule conversion so naive local New York timestamps are converted to UTC without treating them as UTC. Preserve ordinary dates and do not hardcode a DST offset.",
  setup(root) {
    write(root, "schedule/__init__.py", "");
    write(
      root,
      "schedule/time.py",
      [
        "from datetime import timezone",
        "def to_utc(value):",
        "    return value.replace(tzinfo=timezone.utc)",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_schedule.py",
      [
        "import unittest",
        "from datetime import datetime",
        "from schedule.time import to_utc",
        "class ScheduleTest(unittest.TestCase):",
        "    def test_dst_boundary(self):",
        "        self.assertEqual(to_utc(datetime(2026, 3, 8, 3, 30)).isoformat(), '2026-03-08T07:30:00+00:00')",
        "    def test_winter(self):",
        "        self.assertEqual(to_utc(datetime(2026, 1, 1, 12, 0)).isoformat(), '2026-01-01T17:00:00+00:00')",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_schedule.py"],
  allowed: ["schedule"],
  command: ["python3", "-m", "unittest", "tests.test_schedule", "-v"],
  gold(root) {
    write(
      root,
      "schedule/time.py",
      [
        "from datetime import timezone",
        "from zoneinfo import ZoneInfo",
        "def to_utc(value):",
        "    return value.replace(tzinfo=ZoneInfo('America/New_York')).astimezone(timezone.utc)",
        "",
      ].join("\n"),
    );
  },
};

const t09 = {
  id: "T09",
  prompt:
    "Make report output deterministic while preserving the documented descending score order. Equal scores must have a stable secondary key, and running the stress script must produce identical output every time.",
  setup(root) {
    write(root, "report/__init__.py", "");
    write(
      root,
      "report/render.py",
      [
        "def render(items):",
        "    rows=[(name,score) for name,score in items]",
        "    return '\\n'.join(f'{name}:{score}' for name,score in rows)",
        "",
      ].join("\n"),
    );
    write(
      root,
      "scripts/stress_order.py",
      [
        "import subprocess, sys",
        "outputs=set()",
        "for _ in range(20):",
        "    outputs.add(subprocess.check_output([sys.executable,'-m','report'],text=True))",
        "assert len(outputs)==1, outputs",
        "",
      ].join("\n"),
    );
    write(
      root,
      "report/__main__.py",
      [
        "from .render import render",
        "items={('b',2),('a',2),('c',1)}",
        "print(render(items))",
        "",
      ].join("\n"),
    );
    write(
      root,
      "tests/test_report.py",
      [
        "import unittest",
        "from report.render import render",
        "class ReportTest(unittest.TestCase):",
        "    def test_order(self): self.assertEqual(render({('b',2),('a',2),('c',1)}).splitlines(), ['a:2','b:2','c:1'])",
        "",
      ].join("\n"),
    );
  },
  protected: ["tests/test_report.py"],
  allowed: ["report", "tests"],
  command: ["python3", "-m", "unittest", "tests.test_report", "-v"],
  extraCommand: [["python3", "scripts/stress_order.py"]],
  gold(root) {
    write(
      root,
      "report/render.py",
      [
        "def render(items):",
        "    rows=sorted(items, key=lambda row: (-row[1], row[0]))",
        "    return '\\n'.join(f'{name}:{score}' for name,score in rows)",
        "",
      ].join("\n"),
    );
  },
};

export const extendedATasks = [t04, t05, t06, t07, t08, t09];
