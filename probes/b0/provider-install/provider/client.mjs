function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

class ClientError extends Error {
  constructor(message, details = {}) {
    super(message);
    Object.assign(this, details);
    this.name = details.name ?? "ClientError";
  }
}

export class ProviderHttpError extends ClientError {
  constructor(message, details) {
    super(message, { ...details, name: "ProviderHttpError" });
  }
}

export class ProviderStreamError extends ClientError {
  constructor(message, details) {
    super(message, { ...details, name: "ProviderStreamError" });
  }
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return null;
  }
  return {
    input_tokens: usage.input_tokens ?? null,
    output_tokens: usage.output_tokens ?? null,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? null,
  };
}

function normalizeBlock(block) {
  if (block.type === "text") {
    return { type: "text", text: block.text ?? "" };
  }
  if (block.type === "tool_use") {
    return {
      type: "tool_use",
      id: block.id,
      name: block.name,
      input: cloneJson(block.input ?? {}),
    };
  }
  return {
    type: "provider_opaque",
    provider: "mock",
    wire_type: block.type,
    raw: cloneJson(block),
  };
}

async function responseError(response) {
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Preserve the raw body when the provider fails before returning JSON.
  }
  const error = payload?.error ?? {};
  throw new ProviderHttpError(error.message ?? `HTTP ${response.status}`, {
    status: response.status,
    providerType: error.type ?? null,
    providerCode: error.code ?? null,
    requestId: payload?.request_id ?? response.headers.get("x-request-id"),
    retryAfter: response.headers.get("retry-after"),
    retryable:
      response.status === 408 ||
      response.status === 409 ||
      response.status === 429 ||
      response.status >= 500,
    rawBody: text,
  });
}

function parseSseBlock(block) {
  const lines = block.split(/\r?\n/);
  let event = "message";
  const data = [];
  for (const line of lines) {
    if (line === "" || line.startsWith(":")) {
      continue;
    }
    const separator = line.indexOf(":");
    const field = separator === -1 ? line : line.slice(0, separator);
    let value = separator === -1 ? "" : line.slice(separator + 1);
    if (value.startsWith(" ")) {
      value = value.slice(1);
    }
    if (field === "event") {
      event = value;
    } else if (field === "data") {
      data.push(value);
    }
  }
  return { event, data: data.join("\n") };
}

function processSseBuffer(buffer, flush, state) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop();
  for (const block of blocks) {
    const parsed = parseSseBlock(block);
    if (parsed.data === "") {
      continue;
    }
    let payload;
    try {
      payload = JSON.parse(parsed.data);
    } catch (cause) {
      throw new ProviderStreamError("Malformed SSE JSON payload", {
        cause,
        code: "invalid_sse_json",
        event: parsed.event,
        rawData: parsed.data,
        partial: snapshotPartial(state),
      });
    }
    handleEvent(parsed.event, payload, state);
  }
  if (flush && remainder.trim() !== "") {
    throw new ProviderStreamError("SSE stream ended without a blank-line delimiter", {
      code: "truncated_sse",
      partial: snapshotPartial(state),
      rawRemainder: remainder,
    });
  }
  return remainder;
}

function ensureBlock(state, index, initial = {}) {
  if (!state.blocks[index]) {
    state.blocks[index] = initial;
  }
  return state.blocks[index];
}

function snapshotPartial(state) {
  const snapshot = cloneJson(state.result);
  snapshot.content = state.blocks.filter(Boolean).map((block) => {
    if (block.type === "tool_use" && typeof block._input_json === "string") {
      let input = {};
      try {
        input = JSON.parse(block._input_json || "{}");
      } catch {
        input = { _incomplete_json: block._input_json };
      }
      return {
        type: "tool_use",
        id: block.id,
        name: block.name,
        input,
      };
    }
    return normalizeBlock(block);
  });
  snapshot.incomplete = !state.stopped;
  return snapshot;
}

function handleEvent(eventName, payload, state) {
  if (eventName === "error" || payload.type === "error") {
    const error = payload.error ?? {};
    throw new ProviderStreamError(error.message ?? "Provider stream error", {
      code: error.code ?? error.type ?? "provider_error",
      providerType: error.type ?? null,
      providerCode: error.code ?? null,
      requestId: payload.request_id ?? null,
      retryable: Boolean(error.retryable),
      partial: snapshotPartial(state),
    });
  }

  if (payload.type === "message_start") {
    state.started = true;
    state.responseId = payload.message?.id ?? null;
    state.model = payload.message?.model ?? state.model;
    state.usage = normalizeUsage(payload.message?.usage);
    return;
  }

  if (payload.type === "content_block_start") {
    const block = cloneJson(payload.content_block);
    if (block.type === "text") {
      block.text = block.text ?? "";
    }
    if (block.type === "tool_use") {
      block.input = {};
      block._input_json = "";
    }
    state.blocks[payload.index] = block;
    return;
  }

  if (payload.type === "content_block_delta") {
    const block = ensureBlock(state, payload.index);
    const delta = payload.delta ?? {};
    if (delta.type === "text_delta") {
      block.type ??= "text";
      block.text = `${block.text ?? ""}${delta.text ?? ""}`;
    } else if (delta.type === "input_json_delta") {
      block._input_json = `${block._input_json ?? ""}${delta.partial_json ?? ""}`;
    } else if (delta.type === "thinking_delta") {
      block.thinking = `${block.thinking ?? ""}${delta.thinking ?? ""}`;
    } else if (delta.type === "signature_delta") {
      block.signature = `${block.signature ?? ""}${delta.signature ?? ""}`;
    } else {
      block._unknown_deltas ??= [];
      block._unknown_deltas.push(cloneJson(delta));
    }
    return;
  }

  if (payload.type === "content_block_stop") {
    const block = ensureBlock(state, payload.index);
    if (block.type === "tool_use") {
      try {
        block.input = JSON.parse(block._input_json || "{}");
      } catch (cause) {
        throw new ProviderStreamError("Tool input JSON was incomplete or invalid", {
          cause,
          code: "invalid_tool_input_json",
          rawInputJson: block._input_json,
          partial: snapshotPartial(state),
        });
      }
      delete block._input_json;
    }
    state.result.content.push(normalizeBlock(block));
    return;
  }

  if (payload.type === "message_delta") {
    state.stopReason = payload.delta?.stop_reason ?? state.stopReason;
    if (payload.usage) {
      state.usage = {
        ...(state.usage ?? {}),
        ...normalizeUsage(payload.usage),
      };
    }
    return;
  }

  if (payload.type === "message_stop") {
    state.stopped = true;
    return;
  }

  state.unknownEvents.push({ event: eventName, payload: cloneJson(payload) });
}

export async function streamMessage({
  baseUrl,
  body,
  signal,
  fetchImpl = fetch,
  onEvent,
}) {
  const response = await fetchImpl(`${baseUrl}/v1/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    await responseError(response);
  }
  if (!response.body) {
    throw new ProviderStreamError("Provider response has no body", {
      code: "missing_response_body",
    });
  }

  const state = {
    blocks: [],
    model: body.model ?? null,
    responseId: null,
    result: {
      id: null,
      role: "assistant",
      model: body.model ?? null,
      content: [],
      stop_reason: null,
      usage: null,
      opaque_artifacts: [],
    },
    startUsage: null,
    stopReason: null,
    stopped: false,
    started: false,
    unknownEvents: [],
  };

  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      buffer = processSseBuffer(buffer, false, state);
      onEvent?.({ chunkBytes: chunk.byteLength, partial: snapshotPartial(state) });
    }
    buffer += decoder.decode();
    processSseBuffer(buffer, true, state);
  } catch (error) {
    if (signal?.aborted) {
      throw new ProviderStreamError("Provider request was aborted", {
        cause: error,
        code: "aborted",
        partial: snapshotPartial(state),
      });
    }
    if (error instanceof ProviderStreamError) {
      throw error;
    }
    throw new ProviderStreamError("Provider stream failed", {
      cause: error,
      code: state.started && !state.stopped ? "stream_interrupted" : "stream_transport_error",
      partial: snapshotPartial(state),
    });
  }

  if (signal?.aborted) {
    throw new ProviderStreamError("Provider request was aborted", {
      code: "aborted",
      partial: snapshotPartial(state),
    });
  }

  if (!state.stopped) {
    throw new ProviderStreamError("Provider stream ended before message_stop", {
      code: "stream_incomplete",
      partial: snapshotPartial(state),
    });
  }

  const responseId = state.responseId;
  const normalizedModel = state.model;
  const stopReason = state.stopReason;
  const usage = state.usage;
  state.result.id = responseId;
  state.result.model = normalizedModel;
  state.result.stop_reason = stopReason;
  state.result.usage = usage;
  state.result.opaque_artifacts = state.result.content
    .filter((block) => block.type === "provider_opaque")
    .map((block) => cloneJson(block.raw));
  state.result.unknown_events = state.unknownEvents;
  return state.result;
}
