import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, relative } from "node:path";

import { readObject } from "../tools/input.js";
import type {
  Tool,
  ToolResult,
} from "../tools/tool-registry.js";

export interface Skill {
  readonly content: string;
  readonly name: string;
  readonly path: string;
}

const maxSkillBytes = 128 * 1024;

export class SkillRegistry {
  readonly #skills = new Map<string, Skill>();

  constructor(workspaceRoot: string) {
    const root = join(workspaceRoot, ".spool", "skills");
    if (existsSync(root)) {
      this.#load(root);
    }
  }

  list(): Skill[] {
    return [...this.#skills.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }

  read(name: string): Skill | undefined {
    return this.#skills.get(name);
  }

  tool(): Tool {
    const registry = this;
    return {
      description:
        "List or read a declarative project skill from .spool/skills.",
      effect: "read",
      inputSchema: {
        additionalProperties: false,
        properties: {
          name: { type: "string" },
        },
        type: "object",
      },
      name: "skill",
      async invoke(input, _context): Promise<ToolResult> {
        const object = readObject(input);
        if (!object) {
          return {
            output: { message: "input must be an object" },
            status: "error",
          };
        }
        const name =
          typeof object.name === "string" ? object.name : undefined;
        if (!name) {
          return {
            output: {
              skills: registry.list().map((skill) => ({
                name: skill.name,
                path: skill.path,
              })),
            },
            status: "ok",
          };
        }
        const skill = registry.read(name);
        if (!skill) {
          return {
            output: { message: `skill ${name} does not exist` },
            status: "error",
          };
        }
        return {
          output: {
            content: skill.content,
            name: skill.name,
            path: skill.path,
          },
          status: "ok",
        };
      },
    };
  }

  #load(root: string): void {
    const visit = (directory: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
          visit(path);
          continue;
        }
        if (!entry.isFile() || !entry.name.endsWith(".md")) {
          continue;
        }
        if (statSync(path).size > maxSkillBytes) {
          continue;
        }
        const name = relative(root, path)
          .replace(/\.md$/i, "")
          .replaceAll("\\", "/");
        this.#skills.set(name, {
          content: readFileSync(path, "utf8"),
          name,
          path: relative(join(root, "..", ".."), path),
        });
      }
    };
    visit(root);
  }
}
