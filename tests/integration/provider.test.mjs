import assert from "node:assert/strict";
import http from "node:http";
import { test } from "node:test";

import {
  ProviderHttpError,
} from "../../dist/providers/provider.js";
import { OpenAICompatibleProvider } from "../../dist/providers/openai-compatible.js";

async function listen(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("server did not expose a TCP address");
  }
  return {
    close: () => new Promise((resolve) => server.close(resolve)),
    url: `http://127.0.0.1:${address.port}/v1`,
  };
}

function sse(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\r\n\r\n`);
}

test("OpenAI-compatible adapter streams text, tool calls, usage, and request metadata", async () => {
  const requests = [];
  const server = await listen((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      requests.push(JSON.parse(body));
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "x-request-id": "req-provider-1",
      });
      sse(response, {
        choices: [
          { delta: { content: "calling " }, finish_reason: null, index: 0 },
        ],
      });
      sse(response, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  function: { arguments: '{"path":"a', name: "write_file" },
                  id: "call-1",
                  index: 0,
                },
              ],
            },
            finish_reason: null,
            index: 0,
          },
        ],
      });
      sse(response, {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  function: { arguments: '","content":"x"}' },
                  index: 0,
                },
              ],
            },
            finish_reason: "tool_calls",
            index: 0,
          },
        ],
      });
      sse(response, {
        choices: [],
        usage: { completion_tokens: 4, prompt_tokens: 12 },
      });
      response.write("data: [DONE]\r\n\r\n");
      response.end();
    });
  });

  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseUrl: server.url,
      maxOutputTokens: 128,
      model: "mock-model",
      providerName: "mock",
      systemPrompt: "system",
    });
    const result = await provider.next(
      {
        input: "write a file",
        messages: [{ content: "write a file", role: "user" }],
        runId: "run-1",
        sessionId: "session-1",
        step: 0,
        tools: [
          {
            description: "write a file",
            inputSchema: { type: "object" },
            name: "write_file",
          },
        ],
      },
      new AbortController().signal,
    );

    assert.deepEqual(result, {
      calls: [
        {
          callId: "call-1",
          input: { content: "x", path: "a" },
          name: "write_file",
        },
      ],
      opaqueArtifacts: [],
      text: "calling ",
      type: "tool_calls",
      usage: { inputTokens: 12, outputTokens: 4 },
    });
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].messages, [
      { content: "system", role: "system" },
      { content: "write a file", role: "user" },
    ]);
    assert.equal(requests[0].model, "mock-model");
    assert.equal(requests[0].stream, true);
  } finally {
    await server.close();
  }
});

test("OpenAI-compatible adapter exposes normalized HTTP errors", async () => {
  const server = await listen((_request, response) => {
    response.writeHead(429, {
      "Content-Type": "application/json",
      "x-request-id": "req-rate-limit",
    });
    response.end(
      JSON.stringify({
        error: {
          message: "too many requests",
          type: "rate_limit_error",
        },
      }),
    );
  });

  try {
    const provider = new OpenAICompatibleProvider({
      apiKey: "test-key",
      baseUrl: server.url,
      model: "mock-model",
      providerName: "mock",
    });
    await assert.rejects(
      provider.next(
        {
          input: "hello",
          messages: [{ content: "hello", role: "user" }],
          runId: "run-1",
          sessionId: "session-1",
          step: 0,
          tools: [],
        },
        new AbortController().signal,
      ),
      (error) => {
        assert.ok(error instanceof ProviderHttpError);
        assert.equal(error.status, 429);
        assert.equal(error.retryable, true);
        assert.equal(error.code, "rate_limit_error");
        assert.equal(error.requestId, "req-rate-limit");
        return true;
      },
    );
  } finally {
    await server.close();
  }
});
