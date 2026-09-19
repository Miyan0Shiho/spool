import os
import signal
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

base = Path(__file__).resolve().parent
db_path = base / "python-3.11.sqlite"
backup_path = base / "python-3.11-backup.sqlite"

for path in (db_path, backup_path):
    for suffix in ("", "-wal", "-shm"):
        try:
            Path(f"{path}{suffix}").unlink()
        except FileNotFoundError:
            pass

db = sqlite3.connect(db_path, isolation_level=None)
db.execute("PRAGMA journal_mode = WAL")
db.execute("PRAGMA synchronous = FULL")
db.execute("CREATE TABLE events (id INTEGER PRIMARY KEY, value TEXT NOT NULL)")
db.execute("BEGIN IMMEDIATE")
db.execute("INSERT INTO events (value) VALUES (?)", ("committed",))
db.execute("COMMIT")
db.execute("BEGIN IMMEDIATE")
db.execute("INSERT INTO events (value) VALUES (?)", ("rolled-back",))
db.execute("ROLLBACK")

backup_db = sqlite3.connect(backup_path)
db.backup(backup_db)

child = subprocess.Popen(
    [sys.executable, "-c", "import time; print('CHILD_READY', flush=True); time.sleep(30)"],
    stdout=subprocess.PIPE,
    text=True,
    start_new_session=True,
)
ready = child.stdout.readline().strip()
os.killpg(child.pid, signal.SIGTERM)
child.wait(timeout=5)

result = {
    "python": sys.version,
    "executable": sys.executable,
    "sqliteVersion": sqlite3.sqlite_version,
    "threadsafety": sqlite3.threadsafety,
    "journalMode": db.execute("PRAGMA journal_mode").fetchone()[0],
    "synchronous": db.execute("PRAGMA synchronous").fetchone()[0],
    "rows": db.execute("SELECT id, value FROM events ORDER BY id").fetchall(),
    "integrity": db.execute("PRAGMA integrity_check").fetchone()[0],
    "backupCount": backup_db.execute("SELECT COUNT(*) FROM events").fetchone()[0],
    "processGroupReady": ready,
    "processGroupExitCode": child.returncode,
}

print(result)
backup_db.close()
db.close()
