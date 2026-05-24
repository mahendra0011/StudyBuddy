const API_BASE = import.meta.env.VITE_API_URL || "";

function getErrorMessage(data, fallback = "Request failed.") {
  return data?.message || data?.error || fallback;
}

export async function apiRequest(path, options = {}) {
  const hasBody = Object.prototype.hasOwnProperty.call(options, "body");
  const headers = {
    ...(hasBody && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body: hasBody
      ? options.body instanceof FormData
        ? options.body
        : JSON.stringify(options.body || {})
      : undefined
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(getErrorMessage(data, `Request failed with status ${response.status}`));
  }

  return data;
}

function parseSseEvent(rawEvent) {
  const eventName = rawEvent.split(/\r?\n/).find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
  const data = rawEvent
    .split(/\r?\n/)
    .filter(line => line.startsWith("data:"))
    .map(line => line.slice(5).trimStart())
    .join("\n")
    .trim();

  return {
    event: eventName,
    data: data ? JSON.parse(data) : null
  };
}

export async function streamGenerateNotes(payload, onChunk) {
  const response = await fetch(`${API_BASE}/api/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(getErrorMessage(data, "Failed to generate notes."));
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not available in this browser.");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: !done });
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || "";

      for (const rawEvent of events) {
        const parsed = parseSseEvent(rawEvent);
        if (parsed.event === "chunk" && parsed.data) {
          fullText += parsed.data;
          onChunk(fullText);
        }
        if (parsed.event === "error") {
          throw new Error(parsed.data?.message || "Generation failed.");
        }
      }
    }

    if (done) {
      break;
    }
  }

  return fullText;
}
