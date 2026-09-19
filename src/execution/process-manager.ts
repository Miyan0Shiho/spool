import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";

export interface ProcessStartOptions {
  readonly command: string;
  readonly cwd: string;
  readonly maxPreviewBytes?: number;
  readonly sandbox?: {
    readonly workspaceRoot: string;
  };
  readonly timeoutMs?: number;
}

export interface ProcessExit {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ProcessClose extends ProcessExit {
  readonly closeTimedOut: boolean;
}

export interface ProcessTermination {
  readonly forced: boolean;
  readonly residual: boolean;
}

export interface ProcessOutput {
  readonly bytes: number;
  readonly path: string;
  readonly preview: string;
  readonly truncated: boolean;
}

const environmentAllowlist = [
  "HOME",
  "LANG",
  "LC_ALL",
  "PATH",
  "PYTHONDONTWRITEBYTECODE",
  "PYTEST_ADDOPTS",
  "SHELL",
  "TERM",
  "TMPDIR",
  "USER",
] as const;

function controlledEnvironment(
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...overrides };
  for (const name of environmentAllowlist) {
    const value = process.env[name];
    if (value !== undefined) {
      environment[name] = value;
    }
  }
  return environment;
}

function processGroupExists(pgid: number): boolean {
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

class OutputCapture {
  readonly path: string;
  #bytes = 0;
  #preview: Buffer[] = [];
  #previewBytes = 0;

  constructor(path: string) {
    this.path = path;
    writeFileSync(path, "");
  }

  append(chunk: Buffer, maxPreviewBytes: number): void {
    appendFileSync(this.path, chunk);
    this.#bytes += chunk.byteLength;
    if (this.#previewBytes < maxPreviewBytes) {
      const remaining = maxPreviewBytes - this.#previewBytes;
      const previewChunk = chunk.subarray(0, remaining);
      this.#preview.push(previewChunk);
      this.#previewBytes += previewChunk.byteLength;
    }
  }

  result(): ProcessOutput {
    return {
      bytes: this.#bytes,
      path: this.path,
      preview: Buffer.concat(this.#preview).toString("utf8"),
      truncated: this.#bytes > this.#previewBytes,
    };
  }
}

export class ProcessHandle {
  readonly id: string;
  readonly pgid: number;
  readonly pid: number;
  readonly startedAt: string;
  readonly stdout: OutputCapture;
  readonly stderr: OutputCapture;
  readonly #child: ChildProcessByStdio<null, Readable, Readable>;
  readonly #cleanupRoot: string;
  readonly #exitPromise: Promise<ProcessExit>;
  readonly #closePromise: Promise<ProcessClose>;

  constructor(
    child: ChildProcessByStdio<null, Readable, Readable>,
    stdout: OutputCapture,
    stderr: OutputCapture,
    cleanupRoot: string,
  ) {
    if (child.pid === undefined) {
      throw new Error("child process did not receive a pid");
    }
    this.#child = child;
    this.id = randomUUID();
    this.pid = child.pid;
    this.pgid = child.pid;
    this.startedAt = new Date().toISOString();
    this.stdout = stdout;
    this.stderr = stderr;
    this.#cleanupRoot = cleanupRoot;
    this.#exitPromise = new Promise((resolve) => {
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    this.#closePromise = new Promise((resolve) => {
      child.once("close", (code, signal) => {
        resolve({ closeTimedOut: false, code, signal });
      });
    });
  }

  get running(): boolean {
    return this.#child.exitCode === null && this.#child.signalCode === null;
  }

  async exit(): Promise<ProcessExit> {
    return this.#exitPromise;
  }

  async close(timeoutMs = 1_000): Promise<ProcessClose> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        this.#closePromise,
        new Promise<ProcessClose>((resolve) => {
          timer = setTimeout(
            () =>
              resolve({
                closeTimedOut: true,
                code: this.#child.exitCode,
                signal: this.#child.signalCode,
              }),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  async cancel(graceMs = 500): Promise<ProcessTermination> {
    if (!this.running) {
      return { forced: false, residual: processGroupExists(this.pgid) };
    }
    try {
      process.kill(-this.pgid, "SIGTERM");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw error;
      }
    }

    const exited = await Promise.race([
      this.exit().then(() => true),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), graceMs)),
    ]);
    let forced = false;
    if (!exited || processGroupExists(this.pgid)) {
      try {
        process.kill(-this.pgid, "SIGKILL");
        forced = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          throw error;
        }
      }
      await Promise.race([
        this.exit(),
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
    return { forced, residual: processGroupExists(this.pgid) };
  }

  cleanup(): void {
    rmSync(this.#cleanupRoot, { force: true, recursive: true });
  }
}

export class ProcessManager {
  readonly #jobs = new Map<string, ProcessHandle>();
  readonly #outputRoot: string;

  constructor(outputRoot = join(tmpdir(), `spool-process-${randomUUID()}`)) {
    this.#outputRoot = outputRoot;
    mkdirSync(this.#outputRoot, { recursive: true });
  }

  get jobCount(): number {
    return this.#jobs.size;
  }

  list(): ProcessHandle[] {
    return [...this.#jobs.values()];
  }

  async run(
    options: ProcessStartOptions,
    signal?: AbortSignal,
  ): Promise<{
    readonly aborted: boolean;
    readonly close: ProcessClose;
    readonly handle: ProcessHandle;
    readonly timedOut: boolean;
  }> {
    const handle = this.start(options);
    const timeoutMs = options.timeoutMs ?? 30_000;
    const outcome = await Promise.race([
      handle
        .close(timeoutMs)
        .then((result) => (result.closeTimedOut ? "timeout" : "closed")),
      new Promise<"aborted">((resolve) => {
        if (signal?.aborted) {
          resolve("aborted");
          return;
        }
        signal?.addEventListener("abort", () => resolve("aborted"), {
          once: true,
        });
      }),
    ]);
    const timedOut = outcome === "timeout";
    const aborted = outcome === "aborted";
    if (timedOut) {
      await handle.cancel();
    } else if (aborted) {
      await handle.cancel();
    }
    const close = await handle.close(1_000);
    this.#jobs.delete(handle.id);
    return { aborted, close, handle, timedOut };
  }

  start(options: ProcessStartOptions): ProcessHandle {
    const id = randomUUID();
    const jobRoot = join(this.#outputRoot, id);
    const sandboxHome = join(jobRoot, "home");
    const sandboxTmp = join(jobRoot, "tmp");
    mkdirSync(sandboxHome, { recursive: true });
    mkdirSync(sandboxTmp, { recursive: true });
    const stdout = new OutputCapture(join(jobRoot, "stdout"));
    const stderr = new OutputCapture(join(jobRoot, "stderr"));
    const environment = controlledEnvironment({
      HOME: sandboxHome,
      TMPDIR: sandboxTmp,
    });
    let command = "/bin/bash";
    let args = ["-c", options.command];
    if (options.sandbox) {
      if (process.platform !== "darwin" || !existsSync("/usr/bin/sandbox-exec")) {
        throw new Error("required sandbox backend is unavailable");
      }
      const workspaceRoot = realpathSync(options.sandbox.workspaceRoot);
      const profilePath = join(jobRoot, "profile.sb");
      writeFileSync(
        profilePath,
        [
          "(version 1)",
          "(allow default)",
          "(deny file-write*)",
          '(allow file-write* (literal "/dev/null"))',
          '(allow file-write* (subpath (param "WORKSPACE")))',
          '(allow file-write* (subpath (param "SANDBOX_TMP")))',
          '(deny file-read* (subpath (param "ORIGINAL_HOME")))',
          '(deny file-read* (subpath "/private/var/folders"))',
          '(allow file-read* (subpath (param "WORKSPACE")))',
          '(allow file-read* (subpath (param "SANDBOX_TMP")))',
          "(deny network*)",
          "",
        ].join("\n"),
      );
      command = "/usr/bin/sandbox-exec";
      args = [
        "-f",
        profilePath,
        "-D",
        `WORKSPACE=${workspaceRoot}`,
        "-D",
        `SANDBOX_TMP=${sandboxTmp}`,
        "-D",
        `ORIGINAL_HOME=${realpathSync(process.env.HOME ?? "/Users")}`,
        "--",
        "/bin/bash",
        "-c",
        options.command,
      ];
    }
    const child = spawn(command, args, {
      cwd: options.cwd,
      detached: true,
      env: environment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const handle = new ProcessHandle(child, stdout, stderr, jobRoot);
    const maxPreviewBytes = options.maxPreviewBytes ?? 256 * 1024;
    child.stdout.on("data", (chunk: Buffer) =>
      stdout.append(chunk, maxPreviewBytes),
    );
    child.stderr.on("data", (chunk: Buffer) =>
      stderr.append(chunk, maxPreviewBytes),
    );
    this.#jobs.set(handle.id, handle);
    handle.close().then(() => {
      // Preserve completed jobs for explicit reads and kills.
    });
    return handle;
  }

  output(handle: ProcessHandle): {
    readonly stderr: ProcessOutput;
    readonly stdout: ProcessOutput;
  } {
    return {
      stderr: handle.stderr.result(),
      stdout: handle.stdout.result(),
    };
  }

  readOutputFile(path: string): string {
    return readFileSync(path, "utf8");
  }
}
