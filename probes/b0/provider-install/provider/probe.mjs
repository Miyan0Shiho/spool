import assert from "node:assert/strict";
import { startMockProvider } from "./mock-provider-server.mjs";
import {
  ProviderHttpError,
  ProviderStreamError,
  streamMessage,
} from "./client.mjs";

const results = [];

async function run(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, status: "PASS", detail });
    console.log(`PASS ${name} ${JSON.stringify(detail ?? {})}`);
  } catch (error) {
    results.push({
      name,
      status: "FAIL",
      detail: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack,
      },
    });
    console.error(`FAIL ${name} ${error.stack ?? error}`);
  }
}

function requestBody(scenario, messages = []) {
  return {
    model: "mock-spool-1",
    max_tokens: 128,
    messages,
    metadata: { scenario },
  };
}

const provider = await startMockProvider();

try {
  await run("text_delta_and_usage", async () => {
    const response = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("text"),
    });
    assert.equal(response.id, "msg_text");
    assert.deepEqual(response.content, [{ type: "text", text: "你好, spool." }]);
    assert.deepEqual(response.usage, {
      input_tokens: 12,
      output_tokens: 4,
      cache_read_input_tokens: 2,
      cache_creation_input_tokens: null,
    });
    assert.equal(response.stop_reason, "end_turn");
    return { text: response.content[0].text, usage: response.usage };
  });

  await run("usage_missing_is_unknown", async () => {
    const response = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("usage_missing"),
    });
    assert.equal(response.usage, null);
    assert.equal(response.stop_reason, "end_turn");
    return { usage: response.usage };
  });

  await run("multibyte_utf8_split", async () => {
    const response = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("multibyte_split"),
    });
    assert.equal(response.content[0].text, "你好, spool.");
    return { text: response.content[0].text };
  });

  const firstToolTurn = await run("tool_call_arguments_reassembled", async () => {
    const response = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("tool"),
    });
    assert.equal(response.stop_reason, "tool_use");
    assert.deepEqual(response.content, [
      {
        type: "tool_use",
        id: "toolu_fixture_1",
        name: "write_file",
        input: { path: "src/a.txt", content: "line\ntwo" },
      },
    ]);
    return { toolCall: response.content[0] };
  });

  await run("tool_result_second_turn", async () => {
    const first = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("tool"),
    });
    const secondMessages = [
      { role: "user", content: [{ type: "text", text: "write the fixture" }] },
      { role: "assistant", content: first.content },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: first.content[0].id,
            content: "wrote src/a.txt",
            is_error: false,
          },
        ],
      },
    ];
    const echo = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody("request_echo", secondMessages)),
    }).then((response) => response.json());
    assert.equal(echo.messages[1].content[0].type, "tool_use");
    assert.deepEqual(echo.messages[1].content[0].input, first.content[0].input);
    assert.equal(echo.messages[2].content[0].type, "tool_result");
    assert.equal(echo.messages[2].content[0].tool_use_id, "toolu_fixture_1");
    const second = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("second_turn", secondMessages),
    });
    assert.equal(second.content[0].text, "second turn complete");
    return {
      roundTripMessages: echo.messages,
      secondTurnText: second.content[0].text,
    };
  });

  await run("interrupted_stream_preserves_partial", async () => {
    let error;
    try {
      await streamMessage({
        baseUrl: provider.baseUrl,
        body: requestBody("interrupted"),
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderStreamError);
    assert.equal(error.code, "stream_interrupted");
    assert.equal(error.partial.content[0].text, "partial-");
    return { code: error.code, partial: error.partial };
  });

  await run("abort_signal_cancels_stream", async () => {
    const controller = new AbortController();
    let error;
    const pending = streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("abort"),
      signal: controller.signal,
      onEvent: ({ partial }) => {
        if (partial.content?.[0]?.text === "before-abort") {
          controller.abort("fixture user cancel");
        }
      },
    });
    try {
      await pending;
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderStreamError);
    assert.equal(error.code, "aborted");
    assert.equal(error.partial.content[0].text, "before-abort");
    return { code: error.code, partial: error.partial, signalAborted: controller.signal.aborted };
  });

  await run("structured_http_error", async () => {
    let error;
    try {
      await streamMessage({
        baseUrl: provider.baseUrl,
        body: requestBody("http_error"),
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderHttpError);
    assert.equal(error.status, 429);
    assert.equal(error.providerType, "rate_limit_error");
    assert.equal(error.providerCode, "requests_per_minute");
    assert.equal(error.retryable, true);
    assert.equal(error.retryAfter, "2");
    return {
      status: error.status,
      providerType: error.providerType,
      providerCode: error.providerCode,
      retryable: error.retryable,
      retryAfter: error.retryAfter,
      requestId: error.requestId,
    };
  });

  await run("structured_sse_error", async () => {
    let error;
    try {
      await streamMessage({
        baseUrl: provider.baseUrl,
        body: requestBody("sse_error"),
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderStreamError);
    assert.equal(error.code, "upstream_overloaded");
    assert.equal(error.providerType, "overloaded_error");
    assert.equal(error.retryable, true);
    return {
      code: error.code,
      providerType: error.providerType,
      retryable: error.retryable,
      requestId: error.requestId,
    };
  });

  await run("malformed_json_is_structured", async () => {
    let error;
    try {
      await streamMessage({
        baseUrl: provider.baseUrl,
        body: requestBody("malformed_json"),
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderStreamError);
    assert.equal(error.code, "invalid_sse_json");
    assert.match(error.rawData, /text_delta/);
    return { code: error.code, rawData: error.rawData, partial: error.partial };
  });

  await run("truncated_sse_is_structured", async () => {
    let error;
    try {
      await streamMessage({
        baseUrl: provider.baseUrl,
        body: requestBody("truncated_sse"),
      });
    } catch (caught) {
      error = caught;
    }
    assert(error instanceof ProviderStreamError);
    assert.equal(error.code, "truncated_sse");
    assert.match(error.rawRemainder, /unterminated/);
    return { code: error.code, rawRemainder: error.rawRemainder };
  });

  await run("opaque_artifact_exact_round_trip", async () => {
    const first = await streamMessage({
      baseUrl: provider.baseUrl,
      body: requestBody("opaque"),
    });
    assert.equal(first.content[0].type, "provider_opaque");
    assert.deepEqual(first.content[0].raw.provider_extension, {
      opaque_token: "opaque.token.value",
      nested: { keep: [1, true, null, "字"] },
    });
    assert.equal(first.content[0].raw.signature, "signed:abc123");
    assert.deepEqual(first.content[1].raw.data, {
      artifact_id: "artifact-9",
      checksum: "sha256:fixture",
    });
    assert.deepEqual(first.opaque_artifacts, first.content.slice(0, 2).map((block) => block.raw));

    const messages = [
      { role: "user", content: [{ type: "text", text: "continue with opaque state" }] },
      {
        role: "assistant",
        content: first.content.map((block) =>
          block.type === "provider_opaque" ? block.raw : block,
        ),
        opaque_artifacts: first.opaque_artifacts,
      },
    ];
    const echo = await fetch(`${provider.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody("request_echo", messages)),
    }).then((response) => response.json());
    assert.deepEqual(echo.messages, messages);
    return {
      content: first.content,
      opaqueArtifacts: first.opaque_artifacts,
      exactRequestRoundTrip: true,
    };
  });
} finally {
  await provider.close();
}

const failed = results.filter((result) => result.status === "FAIL");
console.log(
  `SUMMARY ${JSON.stringify({
    pass: results.length - failed.length,
    fail: failed.length,
    total: results.length,
    observedRequests: provider.observations.length,
  })}`,
);

if (failed.length > 0) {
  process.exitCode = 1;
}
