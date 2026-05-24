const GEMINI_MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-001"];
const GEMINI_REQUEST_TIMEOUT_MS = 30000;
const GEMINI_STREAM_IDLE_TIMEOUT_MS = 15000;

function getGeminiModelCandidates() {
    const configured = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
    return Array.from(new Set([configured, ...GEMINI_MODEL_FALLBACKS].filter(Boolean)));
}

function getGeminiUrl(model, method) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
}

function getMaxOutputTokens(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return 1000;
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return 3600;
    }

    return 2600;
}

function getTargetLength(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return "Target length: 250-400 words.";
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return "Target length: 900-1400 words.";
    }

    return "Target length: 650-950 words.";
}

function buildPrompt({ prompt, category, language, depth }) {
    return [
        `Create complete, well-structured ${depth || "exam revision"} for a college student.`,
        `Category: ${category || "General"}`,
        `Student request: ${prompt}`,
        `Language: ${language || "English"}`,
        getTargetLength(depth),
        "",
        "Format the answer in clean Markdown.",
        "Use clear headings, useful bullet points, and practical examples.",
        "Use only these sections:",
        "1. Overview",
        "2. Key points",
        "3. Example",
        "4. Exam tips",
        "",
        "Avoid filler and repeated explanations, but include enough detail for revision."
    ].join("\n");
}

function buildGeminiRequestBody({ prompt, category, language, depth }) {
    return {
        contents: [{
            parts: [{ text: buildPrompt({ prompt, category, language, depth }) }]
        }],
        generationConfig: {
            temperature: 0.25,
            topP: 0.8,
            maxOutputTokens: getMaxOutputTokens(depth)
        }
    };
}

function extractTextFromGeminiData(data) {
    return (data?.candidates || [])
        .flatMap(candidate => candidate?.content?.parts || [])
        .map(part => part.text || "")
        .join("");
}

function normalizeGeminiError(errorData, fallbackStatus) {
    const status = errorData?.error?.status || "GEMINI_ERROR";
    const message = errorData?.error?.message || `Gemini request failed with status ${fallbackStatus}`;

    if (fallbackStatus === 429 || isGeminiQuotaError(status, message)) {
        return {
            status: "GEMINI_RATE_LIMITED",
            message: "Gemini quota or rate limit is reached for this API key. Wait a few minutes, use a key with available quota, or enable billing in Google AI Studio."
        };
    }

    return { status, message };
}

function isGeminiQuotaError(status, message) {
    const value = `${status || ""} ${message || ""}`.toLowerCase();
    return value.includes("429")
        || value.includes("quota")
        || value.includes("rate limit")
        || value.includes("resource_exhausted")
        || value.includes("too many requests");
}

function shouldTryNextModel(response, errorData) {
    const status = (errorData?.error?.status || "").toLowerCase();
    const message = (errorData?.error?.message || "").toLowerCase();

    return response.status === 404
        || status === "not_found"
        || message.includes("not found")
        || message.includes("not supported");
}

async function fetchWithTimeout(url, options = {}, timeoutMs = GEMINI_REQUEST_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function generateNotes(payload) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        const error = new Error("GEMINI_API_KEY is not configured on the server.");
        error.statusCode = 500;
        error.payload = { status: "MISSING_API_KEY", message: error.message };
        throw error;
    }

    let lastError = null;

    for (const model of getGeminiModelCandidates()) {
        const response = await fetchWithTimeout(`${getGeminiUrl(model, "generateContent")}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildGeminiRequestBody(payload))
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            lastError = { response, data };

            if (shouldTryNextModel(response, data)) {
                continue;
            }

            const error = new Error(data?.error?.message || "Gemini request failed.");
            error.statusCode = response.status;
            error.payload = normalizeGeminiError(data, response.status);
            throw error;
        }

        const text = extractTextFromGeminiData(data).trim();

        if (!text) {
            const error = new Error("Gemini returned an empty response.");
            error.statusCode = 502;
            error.payload = { status: "EMPTY_RESPONSE", message: error.message };
            throw error;
        }

        return { text, model };
    }

    const normalizedError = normalizeGeminiError(lastError?.data, lastError?.response?.status || 502);
    const error = new Error(normalizedError.message);
    error.statusCode = lastError?.response?.status || 502;
    error.payload = normalizedError;
    throw error;
}

function parseGeminiStreamEvent(rawEvent) {
    const data = rawEvent
        .split(/\r?\n/)
        .filter(line => line.startsWith("data:"))
        .map(line => line.slice(5).trimStart())
        .join("\n")
        .trim();

    if (!data || data === "[DONE]") {
        return "";
    }

    return extractTextFromGeminiData(JSON.parse(data));
}

function readStreamChunk(reader) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error("Gemini stream timed out before sending more text."));
        }, GEMINI_STREAM_IDLE_TIMEOUT_MS);

        reader.read()
            .then(result => {
                clearTimeout(timeout);
                resolve(result);
            })
            .catch(error => {
                clearTimeout(timeout);
                reject(error);
            });
    });
}

async function streamGeminiText(response, onText) {
    const reader = response.body?.getReader();

    if (!reader) {
        throw new Error("Gemini did not return a readable stream.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
        const { done, value } = await readStreamChunk(reader);

        if (value) {
            buffer += decoder.decode(value, { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || "";

            for (const event of events) {
                const text = parseGeminiStreamEvent(event);
                if (text) {
                    onText(text);
                }
            }
        }

        if (done) {
            break;
        }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        const text = parseGeminiStreamEvent(buffer);
        if (text) {
            onText(text);
        }
    }
}

async function createGeminiStream(payload) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        const error = new Error("GEMINI_API_KEY is not configured on the server.");
        error.statusCode = 500;
        error.payload = { status: "MISSING_API_KEY", message: error.message };
        throw error;
    }

    let lastError = null;

    for (const model of getGeminiModelCandidates()) {
        const response = await fetchWithTimeout(`${getGeminiUrl(model, "streamGenerateContent")}?alt=sse&key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildGeminiRequestBody(payload))
        });

        const contentType = response.headers.get("content-type") || "";

        if (!response.ok) {
            const data = contentType.includes("application/json")
                ? await response.json().catch(() => ({}))
                : {};
            lastError = { response, data };

            if (shouldTryNextModel(response, data)) {
                continue;
            }

            const error = new Error(data?.error?.message || "Gemini stream request failed.");
            error.statusCode = response.status;
            error.payload = normalizeGeminiError(data, response.status);
            throw error;
        }

        return { response, model };
    }

    const normalizedError = normalizeGeminiError(lastError?.data, lastError?.response?.status || 502);
    const error = new Error(normalizedError.message);
    error.statusCode = lastError?.response?.status || 502;
    error.payload = normalizedError;
    throw error;
}

module.exports = {
    createGeminiStream,
    fetchWithTimeout,
    generateNotes,
    normalizeGeminiError,
    streamGeminiText
};
