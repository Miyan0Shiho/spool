import type { JsonObject, JsonValue } from "../contracts/json.js";
import type {
  ToolDescriptor,
} from "../providers/provider.js";
import type { OutputContext } from "../execution/output.js";
import type { ProcessManager } from "../execution/process-manager.js";
import type { Workspace } from "../execution/workspace.js";

export interface ToolResult {
  readonly output: JsonValue;
  readonly status: "error" | "ok" | "unknown";
}

export interface Tool {
  readonly description?: string;
  readonly effect: "process" | "read" | "write";
  readonly inputSchema?: JsonObject;
  readonly name: string;
  invoke(input: JsonValue, context: ToolInvocationContext): Promise<ToolResult>;
}

export interface ToolInvocationContext extends OutputContext {
  readonly signal: AbortSignal;
  readonly processManager?: ProcessManager;
  readonly workspace?: Workspace;
}

export class ToolRegistry {
  readonly #tools = new Map<string, Tool>();

  constructor(tools: readonly Tool[] = []) {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  register(tool: Tool): void {
    if (this.#tools.has(tool.name)) {
      throw new Error(`tool ${tool.name} is already registered`);
    }
    this.#tools.set(tool.name, tool);
  }

  get(name: string): Tool | undefined {
    return this.#tools.get(name);
  }

  descriptors(): ToolDescriptor[] {
    return [...this.#tools.values()].map((tool) => ({
      description: tool.description ?? tool.name,
      inputSchema: tool.inputSchema ?? {
        additionalProperties: true,
        type: "object",
      },
      name: tool.name,
    }));
  }

  async invoke(
    name: string,
    input: JsonValue,
    context: ToolInvocationContext,
  ): Promise<ToolResult> {
    const tool = this.#tools.get(name);
    if (!tool) {
      return {
        output: { message: `unknown tool ${name}` },
        status: "error",
      };
    }
    return tool.invoke(input, context);
  }
}
