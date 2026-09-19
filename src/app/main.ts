import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";

import {
  loadWorkspaceInstructions,
  renderInstructions,
} from "../context/instructions.js";
import { SkillRegistry } from "../extensions/skill-registry.js";
import { PermissionManager } from "../permissions/permission-manager.js";
import { createProvider } from "../providers/factory.js";
import { fileTools } from "../tools/file-tools.js";
import { shellTools } from "../tools/shell-tools.js";
import { ToolRegistry } from "../tools/tool-registry.js";
import { SpoolRuntime } from "./runtime.js";

interface PackageMetadata {
  readonly version: string;
}

const packageMetadata = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
) as PackageMetadata;

const usage = [
  "Usage:",
  "  spool --version",
  "  spool run [options] <prompt>",
  "",
  "Options:",
  "  --headless             Run once and print the final response",
  "  --workspace <path>     Workspace root (default: current directory)",
  "  --session <path>       SQLite session store path",
  "  --provider <name>      deepseek, openai-compatible, fake, fake-write, or fake-stream",
  "  --model <name>         Provider model",
  "  --base-url <url>       OpenAI-compatible base URL",
  "  --api-key-env <name>   Environment variable containing the API key",
  "  --yes                  Approve non-destructive write/process tools",
  "",
].join("\n");

export function isSupportedNodeVersion(version: string): boolean {
  const [majorValue, minorValue] = version.split(".");
  const major = Number(majorValue);
  const minor = Number(minorValue);
  return (
    Number.isInteger(major) &&
    Number.isInteger(minor) &&
    (major > 24 || (major === 24 && minor >= 21))
  );
}

export async function main(argv: readonly string[]): Promise<number> {
  if (!isSupportedNodeVersion(process.versions.node)) {
    process.stderr.write(
      `spool requires Node >=24.21.0; current runtime is ${process.versions.node}\n`,
    );
    return 1;
  }

  if (argv.length === 1 && argv[0] === "--version") {
    process.stdout.write(`spool ${packageMetadata.version}\n`);
    return 0;
  }

  if (argv[0] !== "run") {
    process.stderr.write(usage);
    return 2;
  }

  try {
    const parsed = parseArgs({
      allowPositionals: true,
      args: [...argv.slice(1)],
      options: {
        "api-key-env": { type: "string" },
        "base-url": { type: "string" },
        headless: { type: "boolean" },
        model: { type: "string" },
        provider: { type: "string" },
        session: { type: "string" },
        workspace: { type: "string" },
        yes: { type: "boolean" },
      },
    });
    const workspaceRoot = resolve(
      parsed.values.workspace ?? process.cwd(),
    );
    const providerName = parsed.values.provider ?? "deepseek";
    if (
      providerName !== "deepseek" &&
      providerName !== "openai-compatible" &&
      providerName !== "fake" &&
      providerName !== "fake-stream" &&
      providerName !== "fake-write"
    ) {
      throw new Error(`unsupported provider ${providerName}`);
    }
    const sessionPath =
      parsed.values.session ??
      join(homedir(), ".spool", "sessions", "default.sqlite");
    const instructions = loadWorkspaceInstructions(workspaceRoot);
    const skills = new SkillRegistry(workspaceRoot);
    const systemPrompt = [
      "You are spool, a coding agent. Use tools to inspect and modify the workspace.",
      "Do not claim verification succeeded unless you actually ran the verification command.",
      renderInstructions(instructions),
      skills.list().length > 0
        ? `Available project skills: ${skills
            .list()
            .map((skill) => skill.name)
            .join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const provider = createProvider({
      provider: providerName,
      systemPrompt,
      ...(parsed.values.model ? { model: parsed.values.model } : {}),
      ...(parsed.values["base-url"]
        ? { baseUrl: parsed.values["base-url"] }
        : {}),
      ...(parsed.values["api-key-env"]
        ? { apiKeyEnv: parsed.values["api-key-env"] }
        : {}),
      fakeResponse: "fake provider response",
    });
    const headless = parsed.values.headless ?? false;
    const readline = headless
      ? undefined
      : createInterface({
          input: process.stdin,
          output: process.stdout,
        });
    const permissions = new PermissionManager({
      approvalHandler: async (request) => {
        if (headless) {
          return parsed.values.yes ?? false;
        }
        const answer = await readline?.question(
          `Allow ${request.tool.name} (${request.tool.effect})? [y/N] `,
        );
        return answer?.trim().toLowerCase() === "y";
      },
    });
    const runtime = new SpoolRuntime({
      databasePath: sessionPath,
      permissions,
      provider,
      tools: new ToolRegistry([
        ...fileTools,
        ...shellTools,
        skills.tool(),
      ]),
      workspaceRoot,
    });
    const initialPrompt = parsed.positionals.join(" ").trim();
    try {
      if (headless) {
        if (!initialPrompt) {
          throw new Error("headless run requires a prompt");
        }
        const { outcome } = await runtime.run(
          initialPrompt,
          new AbortController().signal,
        );
        if (outcome.status === "completed") {
          process.stdout.write(`${outcome.text}\n`);
          return 0;
        }
        process.stderr.write(
          `${outcome.status === "failed" ? outcome.error : "run cancelled"}\n`,
        );
        return 1;
      }

      process.stdout.write("spool interactive session\n");
      let pending = initialPrompt;
      while (true) {
        const input =
          pending ||
          (await readline?.question("spool> "))?.trim() ||
          "";
        pending = "";
        if (input === ".exit" || input === "exit") {
          readline?.close();
          process.stdin.pause();
          return 0;
        }
        if (!input) {
          continue;
        }
        let streamedText = false;
        const { outcome } = await runtime.run(
          input,
          new AbortController().signal,
          (event) => {
            if (event.type === "text_delta") {
              streamedText = true;
              process.stdout.write(event.text);
            } else if (event.type === "tool_started") {
              process.stdout.write(`\n[tool] ${event.toolName} started\n`);
            } else if (event.type === "tool_finished") {
              process.stdout.write(
                `[tool] ${event.toolName} ${event.status}\n`,
              );
            } else if (event.type === "tool_denied") {
              process.stdout.write(
                `[tool] ${event.toolName} denied: ${event.reason}\n`,
              );
            }
          },
        );
        if (outcome.status === "completed") {
          if (!streamedText) {
            process.stdout.write(`${outcome.text}\n`);
          }
        } else if (outcome.status === "failed") {
          process.stderr.write(`${outcome.error}\n`);
        } else {
          process.stderr.write("run cancelled\n");
        }
      }
    } finally {
      readline?.close();
      await runtime.close();
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}
