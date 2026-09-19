import type { JsonValue } from "../contracts/json.js";
import type { ArtifactStore, StoredArtifact } from "../storage/store.js";

export interface OutputContext {
  readonly artifacts?: ArtifactStore;
  readonly runId?: string;
  readonly sessionId?: string;
}

export interface BoundedOutput {
  readonly artifact: StoredArtifact | null;
  readonly text: string;
  readonly totalBytes: number;
  readonly truncated: boolean;
}

function truncateUtf8(text: string, maxBytes: number): string {
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength <= maxBytes) {
    return text;
  }
  return bytes.subarray(0, maxBytes).toString("utf8");
}

export function boundText(
  text: string,
  maxBytes: number,
  context: OutputContext = {},
): BoundedOutput {
  const totalBytes = Buffer.byteLength(text, "utf8");
  if (totalBytes <= maxBytes) {
    return {
      artifact: null,
      text,
      totalBytes,
      truncated: false,
    };
  }

  const artifact = context.artifacts
    ? context.artifacts.putArtifact(
        new TextEncoder().encode(text),
        "text/plain",
        context.sessionId
          ? {
              runId: context.runId ?? null,
              sessionId: context.sessionId,
            }
          : undefined,
      )
    : null;
  return {
    artifact,
    text: truncateUtf8(text, maxBytes),
    totalBytes,
    truncated: true,
  };
}

export function boundedJson(
  text: string,
  maxBytes: number,
  context: OutputContext = {},
): JsonValue {
  const output = boundText(text, maxBytes, context);
  return {
    artifact: output.artifact
      ? {
          artifactId: output.artifact.artifactId,
          mediaType: output.artifact.mediaType,
          sha256: output.artifact.sha256,
          sizeBytes: output.artifact.sizeBytes,
        }
      : null,
    text: output.text,
    totalBytes: output.totalBytes,
    truncated: output.truncated,
  };
}

export function outputJson(output: BoundedOutput): JsonValue {
  return {
    artifact: output.artifact
      ? {
          artifactId: output.artifact.artifactId,
          mediaType: output.artifact.mediaType,
          sha256: output.artifact.sha256,
          sizeBytes: output.artifact.sizeBytes,
        }
      : null,
    text: output.text,
    totalBytes: output.totalBytes,
    truncated: output.truncated,
  };
}
