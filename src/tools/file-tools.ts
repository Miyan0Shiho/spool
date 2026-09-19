import {
  mkdirSync,
  openSync,
  closeSync,
  fsyncSync,
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";

import type { JsonObject, JsonValue } from "../contracts/json.js";
import { boundText, outputJson } from "../execution/output.js";
import { WorkspaceViolationError } from "../execution/workspace.js";
import {
  optionalBoolean,
  optionalInteger,
  optionalString,
  readObject,
  requireString,
} from "./input.js";
import type {
  Tool,
  ToolInvocationContext,
  ToolResult,
} from "./tool-registry.js";

const defaultMaxBytes = 256 * 1024;

function errorResult(error: unknown): ToolResult {
  return {
    output: {
      code:
        error instanceof WorkspaceViolationError
          ? "workspace-violation"
          : "tool-error",
      message: error instanceof Error ? error.message : String(error),
    },
    status: "error",
  };
}

function requireWorkspace(context: ToolInvocationContext) {
  if (!context.workspace) {
    throw new Error("workspace context is required");
  }
  return context.workspace;
}

function objectInput(input: JsonValue): JsonObject {
  const object = readObject(input);
  if (!object) {
    throw new Error("input must be an object");
  }
  return object;
}

function globToRegExp(glob: string): RegExp {
  let expression = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const character = glob[index];
    if (character === "*") {
      if (glob[index + 1] === "*") {
        if (glob[index + 2] === "/") {
          expression += "(?:.*/)?";
          index += 2;
        } else {
          expression += ".*";
          index += 1;
        }
      } else {
        expression += "[^/]*";
      }
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character?.replace(/[.+^${}()|[\]\\]/g, "\\$&") ?? "";
    }
  }
  return new RegExp(`${expression}$`);
}

function collectFiles(
  root: string,
  start: string,
  pattern: RegExp,
  maxResults: number,
): { readonly files: string[]; readonly truncated: boolean } {
  const files: string[] = [];
  const visit = (path: string): boolean => {
    const status = lstatSync(path);
    if (status.isFile()) {
      const relativePath = relative(root, path).replaceAll("\\", "/");
      if (pattern.test(relativePath)) {
        files.push(relativePath);
      }
      return files.length < maxResults;
    }
    if (!status.isDirectory() || status.isSymbolicLink()) {
      return true;
    }
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name === ".git") {
        continue;
      }
      if (!visit(join(path, entry.name))) {
        return false;
      }
    }
    return true;
  };

  const complete = visit(start);
  return { files, truncated: !complete };
}

function atomicWrite(path: string, content: string): void {
  const existingMode = statSync(path, { throwIfNoEntry: false })?.mode;
  const mode = existingMode ?? 0o600;
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporaryPath, "wx", mode);
  try {
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  renameSync(temporaryPath, path);
  const directoryDescriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(directoryDescriptor);
  } finally {
    closeSync(directoryDescriptor);
  }
}

const listFiles: Tool = {
  description:
    "List workspace files and directories matching a glob. Returns relative paths.",
  effect: "read",
  inputSchema: {
    additionalProperties: false,
    properties: {
      glob: { type: "string" },
      maxResults: { type: "integer" },
      path: { type: "string" },
    },
    type: "object",
  },
  name: "list_files",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const start = workspace.resolveRead(optionalString(object, "path") ?? ".");
      const glob = optionalString(object, "glob") ?? "**/*";
      const maxResults = Math.min(
        Math.max(optionalInteger(object, "maxResults") ?? 200, 1),
        1_000,
      );
      const result = collectFiles(
        workspace.root,
        start,
        globToRegExp(glob),
        maxResults,
      );
      return {
        output: {
          files: result.files,
          truncated: result.truncated,
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const readFileTool: Tool = {
  description:
    "Read a UTF-8 file from the workspace with optional line offset and limit.",
  effect: "read",
  inputSchema: {
    additionalProperties: false,
    properties: {
      limit: { type: "integer" },
      maxBytes: { type: "integer" },
      offset: { type: "integer" },
      path: { type: "string" },
    },
    required: ["path"],
    type: "object",
  },
  name: "read_file",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const path = workspace.resolveRead(requireString(object, "path"));
      const offset = Math.max(optionalInteger(object, "offset") ?? 1, 1);
      const limit = Math.min(
        Math.max(optionalInteger(object, "limit") ?? 200, 1),
        2_000,
      );
      const maxBytes = Math.max(
        optionalInteger(object, "maxBytes") ?? defaultMaxBytes,
        1,
      );
      const lines = readFileSync(path, "utf8").split(/\r?\n/);
      const selected = lines.slice(offset - 1, offset - 1 + limit);
      const bounded = boundText(selected.join("\n"), maxBytes, context);
      return {
        output: {
          ...(outputJson(bounded) as JsonObject),
          lineEnd: Math.min(offset + selected.length - 1, lines.length),
          lineStart: offset,
          path: workspace.relative(path),
          totalLines: lines.length,
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const searchFiles: Tool = {
  description:
    "Search UTF-8 workspace files with a regular expression and return line matches.",
  effect: "read",
  inputSchema: {
    additionalProperties: false,
    properties: {
      glob: { type: "string" },
      ignoreCase: { type: "boolean" },
      maxBytes: { type: "integer" },
      maxFileBytes: { type: "integer" },
      maxResults: { type: "integer" },
      path: { type: "string" },
      query: { type: "string" },
    },
    required: ["query"],
    type: "object",
  },
  name: "search_files",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const query = requireString(object, "query");
      const path = workspace.resolveRead(optionalString(object, "path") ?? ".");
      const glob = optionalString(object, "glob") ?? "**/*";
      const maxResults = Math.min(
        Math.max(optionalInteger(object, "maxResults") ?? 100, 1),
        1_000,
      );
      const maxBytes = Math.max(
        optionalInteger(object, "maxBytes") ?? defaultMaxBytes,
        1,
      );
      const maxFileBytes = Math.max(
        optionalInteger(object, "maxFileBytes") ?? 1_048_576,
        1,
      );
      const flags = optionalBoolean(object, "ignoreCase") ? "gi" : "g";
      const expression = new RegExp(query, flags);
      const matches: JsonObject[] = [];
      let truncated = false;

      for (const file of collectFiles(
        workspace.root,
        path,
        globToRegExp(glob),
        10_000,
      ).files) {
        const absolute = workspace.resolveRead(file);
        const status = statSync(absolute);
        if (status.size > maxFileBytes) {
          continue;
        }
        const text = readFileSync(absolute, "utf8");
        if (text.includes("\0")) {
          continue;
        }
        for (const [index, line] of text.split(/\r?\n/).entries()) {
          expression.lastIndex = 0;
          if (!expression.test(line)) {
            continue;
          }
          matches.push({
            line: index + 1,
            path: file,
            text: line,
          });
          if (matches.length >= maxResults) {
            truncated = true;
            break;
          }
        }
        if (truncated) {
          break;
        }
      }

      const text = matches
        .map((match) => `${match.path}:${match.line}:${match.text}`)
        .join("\n");
      const bounded = boundText(text, maxBytes, context);
      return {
        output: {
          ...(outputJson(bounded) as JsonObject),
          matchCount: matches.length,
          matches,
          truncated: truncated || bounded.truncated,
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const writeFileTool: Tool = {
  description:
    "Create or replace a UTF-8 file inside the workspace. Parent directories are created.",
  effect: "write",
  inputSchema: {
    additionalProperties: false,
    properties: {
      content: { type: "string" },
      path: { type: "string" },
    },
    required: ["content", "path"],
    type: "object",
  },
  name: "write_file",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const path = workspace.resolveWrite(requireString(object, "path"));
      const content = requireString(object, "content");
      mkdirSync(dirname(path), { recursive: true });
      atomicWrite(path, content);
      return {
        output: {
          bytes: Buffer.byteLength(content, "utf8"),
          path: workspace.relative(path),
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

const editFileTool: Tool = {
  description:
    "Replace exact text in an existing workspace file. Reject ambiguous matches unless replaceAll is true.",
  effect: "write",
  inputSchema: {
    additionalProperties: false,
    properties: {
      newText: { type: "string" },
      oldText: { type: "string" },
      path: { type: "string" },
      replaceAll: { type: "boolean" },
    },
    required: ["newText", "oldText", "path"],
    type: "object",
  },
  name: "edit_file",
  async invoke(input, context) {
    try {
      const object = objectInput(input);
      const workspace = requireWorkspace(context);
      const path = workspace.resolveWrite(requireString(object, "path"));
      const oldText = requireString(object, "oldText");
      const newText = requireString(object, "newText");
      const replaceAll = optionalBoolean(object, "replaceAll") ?? false;
      const content = readFileSync(path, "utf8");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences === 0) {
        return errorResult(new Error("oldText was not found"));
      }
      if (occurrences > 1 && !replaceAll) {
        return errorResult(
          new Error("oldText matched more than once; set replaceAll=true"),
        );
      }
      const updated = replaceAll
        ? content.split(oldText).join(newText)
        : content.replace(oldText, newText);
      atomicWrite(path, updated);
      return {
        output: {
          occurrences,
          path: workspace.relative(path),
        },
        status: "ok",
      };
    } catch (error) {
      return errorResult(error);
    }
  },
};

export const fileTools: readonly Tool[] = [
  listFiles,
  readFileTool,
  searchFiles,
  writeFileTool,
  editFileTool,
];
