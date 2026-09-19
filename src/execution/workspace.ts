import {
  existsSync,
  realpathSync,
  statSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export class WorkspaceViolationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(message);
    this.name = "WorkspaceViolationError";
    this.path = path;
  }
}

export class Workspace {
  readonly root: string;

  constructor(root: string) {
    this.root = realpathSync(root);
  }

  relative(path: string): string {
    const relativePath = relative(this.root, path);
    return relativePath.length === 0 ? "." : relativePath;
  }

  resolveRead(input: string): string {
    const absolute = resolve(this.root, input);
    this.#assertLexicallyInside(absolute);
    if (!existsSync(absolute)) {
      throw new WorkspaceViolationError(input, `path does not exist: ${input}`);
    }

    const canonical = realpathSync(absolute);
    this.#assertCanonicallyInside(input, canonical);
    return canonical;
  }

  resolveWrite(input: string): string {
    const absolute = resolve(this.root, input);
    this.#assertLexicallyInside(absolute);

    let ancestor = absolute;
    while (!existsSync(ancestor)) {
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new WorkspaceViolationError(
          input,
          `no existing ancestor for ${input}`,
        );
      }
      ancestor = parent;
    }
    this.#assertCanonicallyInside(input, realpathSync(ancestor));

    if (existsSync(absolute)) {
      this.#assertCanonicallyInside(input, realpathSync(absolute));
      const status = statSync(absolute);
      if (status.nlink > 1) {
        throw new WorkspaceViolationError(
          input,
          `hard-linked files are not writable: ${input}`,
        );
      }
    }
    return absolute;
  }

  #assertCanonicallyInside(input: string, path: string): void {
    const relativePath = relative(this.root, path);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativePath)
    ) {
      throw new WorkspaceViolationError(
        input,
        `path escapes workspace: ${input}`,
      );
    }
  }

  #assertLexicallyInside(path: string): void {
    const relativePath = relative(this.root, path);
    if (
      relativePath === ".." ||
      relativePath.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) ||
      isAbsolute(relativePath)
    ) {
      throw new WorkspaceViolationError(
        path,
        `path escapes workspace: ${path}`,
      );
    }
  }
}
