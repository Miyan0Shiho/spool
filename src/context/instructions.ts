import { existsSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface WorkspaceInstruction {
  readonly content: string;
  readonly path: string;
}

const instructionFiles = [
  "AGENTS.md",
  "CLAUDE.md",
  ".spool/AGENTS.md",
] as const;
const maxInstructionBytes = 64 * 1024;

export function loadWorkspaceInstructions(
  workspaceRoot: string,
): WorkspaceInstruction[] {
  const instructions: WorkspaceInstruction[] = [];
  for (const file of instructionFiles) {
    const path = join(workspaceRoot, file);
    if (!existsSync(path) || !statSync(path).isFile()) {
      continue;
    }
    const content = readFileSync(path, "utf8");
    instructions.push({
      content:
        Buffer.byteLength(content, "utf8") > maxInstructionBytes
          ? Buffer.from(content, "utf8")
              .subarray(0, maxInstructionBytes)
              .toString("utf8")
          : content,
      path: relative(workspaceRoot, path),
    });
  }
  return instructions;
}

export function renderInstructions(
  instructions: readonly WorkspaceInstruction[],
): string {
  return instructions
    .map(
      (instruction) =>
        `<workspace-instruction path="${instruction.path}">\n${instruction.content}\n</workspace-instruction>`,
    )
    .join("\n\n");
}
