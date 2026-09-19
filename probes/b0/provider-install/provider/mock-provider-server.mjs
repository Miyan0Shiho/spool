import http from "node:http";

const encoder = new TextEncoder();

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new Error("aborted"));
      },
      { once: true },
    );
  });
}

async function writeChunks(res, chunks, pauseMs = 0) {
  for (const chunk of chunks) {
    if (res.destroyed || res.writableEnded) {
      return;
    }
    res.write(chunk);
    if (pauseMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, pauseMs));
    }
  }
}

function writeRawSplit(res, text, splitAtByte) {
  const bytes = encoder.encode(text);
  res.write(Buffer.from(bytes.subarray(0, splitAtByte)));
  setTimeout(() => res.write(Buffer.from(bytes.subarray(splitAtByte))), 10);
}

function startEvent(id, model, usage = { input_tokens: 0, output_tokens: 0 }) {
  const message = {
    id,
    type: "message",
    role: "assistant",
    model,
    content: [],
    stop_reason: null,
  };
  if (usage !== null) {
    message.usage = usage;
  }
  return sse("message_start", {
    type: "message_start",
    message,
  });
}

function stopEvents({ stopReason, usage }) {
  const events = [];
  if (usage !== undefined) {
    events.push(
      sse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage,
      }),
    );
  } else {
    events.push(
      sse("message_delta", {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
      }),
    );
  }
  events.push(sse("message_stop", { type: "message_stop" }));
  return events;
}

function textScenario({ id, model, usage }) {
  return [
    startEvent(id, model),
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "你好, " },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "spool." },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    ...stopEvents({ stopReason: "end_turn", usage }),
  ];
}

function toolScenario({ id, model, usage }) {
  return [
    startEvent(id, model),
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: {
        type: "tool_use",
        id: "toolu_fixture_1",
        name: "write_file",
        input: {},
      },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "input_json_delta",
        partial_json: "{\"path\":\"src/a",
      },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "input_json_delta",
        partial_json: ".txt\",\"content\":\"line\\n",
      },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: {
        type: "input_json_delta",
        partial_json: "two\"}",
      },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    ...stopEvents({ stopReason: "tool_use", usage }),
  ];
}

function opaqueScenario({ id, model, usage }) {
  const opaqueStart = {
    type: "thinking",
    thinking: "",
    signature: "",
    provider_extension: {
      opaque_token: "opaque.token.value",
      nested: { keep: [1, true, null, "字"] },
    },
  };
  return [
    startEvent(id, model),
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: opaqueStart,
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "thinking_delta", thinking: "private chain" },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "signature_delta", signature: "signed:abc123" },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    sse("content_block_start", {
      type: "content_block_start",
      index: 1,
      content_block: {
        type: "provider_unknown_block",
        data: { artifact_id: "artifact-9", checksum: "sha256:fixture" },
      },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 1 }),
    sse("content_block_start", {
      type: "content_block_start",
      index: 2,
      content_block: { type: "text", text: "" },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 2,
      delta: { type: "text_delta", text: "opaque retained" },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 2 }),
    ...stopEvents({ stopReason: "end_turn", usage }),
  ];
}

function plusSecondTurnScenario({ id, model, usage }) {
  return [
    startEvent(id, model),
    sse("content_block_start", {
      type: "content_block_start",
      index: 0,
      content_block: { type: "text", text: "" },
    }),
    sse("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: "second turn complete" },
    }),
    sse("content_block_stop", { type: "content_block_stop", index: 0 }),
    ...stopEvents({ stopReason: "end_turn", usage }),
  ];
}

export async function startMockProvider() {
  const observations = [];
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/messages") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { type: "not_found", message: "not found" } }));
      return;
    }

    let body;
    try {
      body = await readJson(req);
    } catch (error) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: { type: "invalid_request_error", code: "invalid_json", message: error.message },
        }),
      );
      return;
    }

    const scenario = body.metadata?.scenario ?? "text";
    const id = `msg_${scenario}`;
    const model = body.model ?? "mock-model";
    observations.push({ scenario, body });

    if (scenario === "http_error") {
      res.writeHead(429, {
        "content-type": "application/json",
        "retry-after": "2",
        "x-request-id": "req_rate_limited",
      });
      res.end(
        JSON.stringify({
          type: "error",
          error: {
            type: "rate_limit_error",
            code: "requests_per_minute",
            message: "fixture rate limit",
          },
          request_id: "req_rate_limited",
        }),
      );
      return;
    }

    if (scenario === "request_echo") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          type: "message",
          id,
          model,
          content: [{ type: "text", text: "echo" }],
          messages: body.messages,
          stop_reason: "end_turn",
          usage: { input_tokens: 3, output_tokens: 1 },
        }),
      );
      return;
    }

    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-request-id": `req_${scenario}`,
    });

    if (scenario === "text" || scenario === "usage_missing") {
      const usage =
        scenario === "usage_missing"
          ? undefined
          : { input_tokens: 12, output_tokens: 4, cache_read_input_tokens: 2 };
      const events =
        scenario === "usage_missing"
          ? textScenario({ id, model, usage }).map((event) =>
              event.startsWith("event: message_start")
                ? startEvent(id, model, null)
                : event,
            )
          : textScenario({ id, model, usage });
      await writeChunks(res, events, 0);
      res.end();
      return;
    }

    if (scenario === "tool") {
      await writeChunks(res, toolScenario({
        id,
        model,
        usage: { input_tokens: 9, output_tokens: 7 },
      }), 0);
      res.end();
      return;
    }

    if (scenario === "opaque") {
      await writeChunks(res, opaqueScenario({
        id,
        model,
        usage: { input_tokens: 15, output_tokens: 8 },
      }), 0);
      res.end();
      return;
    }

    if (scenario === "multibyte_split") {
      const raw = textScenario({
        id,
        model,
        usage: { input_tokens: 1, output_tokens: 1 },
      }).join("");
      const marker = encoder.encode("你");
      const index = raw.indexOf("你");
      const splitAt = encoder.encode(raw.slice(0, index)).length + 1;
      writeRawSplit(res, raw, splitAt);
      setTimeout(() => res.end(), 25);
      return;
    }

    if (scenario === "interrupted") {
      res.write(startEvent(id, model));
      res.write(
        sse("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      res.write(
        sse("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "partial-" },
        }),
      );
      setTimeout(() => res.destroy(), 15);
      return;
    }

    if (scenario === "malformed_json") {
      res.write(startEvent(id, model));
      res.write("event: content_block_delta\n");
      res.write('data: {"type":"content_block_delta","delta":{"type":"text_delta"\n\n');
      setTimeout(() => res.end(), 15);
      return;
    }

    if (scenario === "truncated_sse") {
      res.write(startEvent(id, model));
      res.write(
        'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"unterminated"}}',
      );
      setTimeout(() => res.end(), 15);
      return;
    }

    if (scenario === "sse_error") {
      res.write(
        sse("error", {
          type: "error",
          error: {
            type: "overloaded_error",
            code: "upstream_overloaded",
            message: "fixture overloaded",
            retryable: true,
          },
          request_id: "req_sse_overloaded",
        }),
      );
      res.end();
      return;
    }

    if (scenario === "abort") {
      res.write(startEvent(id, model));
      res.write(
        sse("content_block_start", {
          type: "content_block_start",
          index: 0,
          content_block: { type: "text", text: "" },
        }),
      );
      res.write(
        sse("content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "before-abort" },
        }),
      );
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000);
        res.once("close", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
      if (!res.destroyed && !res.writableEnded) {
        res.end();
      }
      return;
    }

    if (scenario === "second_turn") {
      await writeChunks(res, plusSecondTurnScenario({
        id,
        model,
        usage: { input_tokens: 20, output_tokens: 3 },
      }), 0);
      res.end();
      return;
    }

    res.write(
      sse("error", {
        type: "error",
        error: { type: "invalid_request_error", message: `unknown scenario: ${scenario}` },
      }),
    );
    res.end();
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    observations,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}
