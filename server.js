const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4173;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const GEMINI_MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-001"];
const GEMINI_REQUEST_TIMEOUT_MS = 30000;
const GEMINI_STREAM_IDLE_TIMEOUT_MS = 15000;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function getGeminiModelCandidates() {
    return Array.from(new Set([GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS].filter(Boolean)));
}

function getGeminiUrl(model, method) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
}

function getMaxOutputTokens(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return 550;
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return 1500;
    }

    return 900;
}

function getTargetLength(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return "Target length: 120-220 words.";
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return "Target length: 500-700 words.";
    }

    return "Target length: 280-420 words.";
}

function buildPrompt({ prompt, category, language, depth }) {
    return [
        `Create very fast, concise ${depth || "exam revision"} for a college student.`,
        `Category: ${category || "General"}`,
        `Student request: ${prompt}`,
        `Language: ${language || "English"}`,
        getTargetLength(depth),
        "",
        "Format the answer in clean Markdown.",
        "Use short headings, tight bullets, and compact examples.",
        "Use only these sections:",
        "1. Overview",
        "2. Key points",
        "3. Example",
        "4. Exam tips",
        "",
        "Avoid long paragraphs, filler, and repeated explanations."
    ].join("\n");
}

function normalizeGeminiError(errorData, fallbackStatus) {
    const status = errorData?.error?.status || "GEMINI_ERROR";
    const message = errorData?.error?.message || `Gemini request failed with status ${fallbackStatus}`;
    return { status, message };
}

function shouldTryNextModel(response, errorData) {
    const status = (errorData?.error?.status || "").toLowerCase();
    const message = (errorData?.error?.message || "").toLowerCase();

    return response.status === 404
        || status === "not_found"
        || message.includes("not found")
        || message.includes("not supported");
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

function writeSse(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_REQUEST_TIMEOUT_MS);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeout);
    }
}

app.post("/api/generate", async (req, res) => {
    const { prompt, category, language, depth } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "Prompt is required."
        });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({
            status: "MISSING_API_KEY",
            message: "GEMINI_API_KEY is not configured on the server."
        });
    }

    try {
        let lastError = null;

        for (const model of getGeminiModelCandidates()) {
            const response = await fetchWithTimeout(`${getGeminiUrl(model, "generateContent")}?key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(buildGeminiRequestBody({ prompt, category, language, depth }))
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                lastError = { response, data };

                if (shouldTryNextModel(response, data)) {
                    continue;
                }

                const normalizedError = normalizeGeminiError(data, response.status);
                return res.status(response.status).json(normalizedError);
            }

            const text = extractTextFromGeminiData(data).trim();

            if (!text) {
                return res.status(502).json({
                    status: "EMPTY_RESPONSE",
                    message: "Gemini returned an empty response."
                });
            }

            return res.json({ text, model });
        }

        const normalizedError = normalizeGeminiError(lastError?.data, lastError?.response?.status || 502);
        return res.status(lastError?.response?.status || 502).json(normalizedError);
    } catch (error) {
        return res.status(502).json({
            status: "NETWORK_ERROR",
            message: error.message || "The server could not reach Gemini."
        });
    }
});

app.post("/api/generate/stream", async (req, res) => {
    const { prompt, category, language, depth } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "Prompt is required."
        });
    }

    if (!GEMINI_API_KEY) {
        return res.status(500).json({
            status: "MISSING_API_KEY",
            message: "GEMINI_API_KEY is not configured on the server."
        });
    }

    let completed = false;

    try {
        let streamResponse = null;
        let streamModel = null;
        let lastError = null;

        for (const model of getGeminiModelCandidates()) {
            const response = await fetchWithTimeout(`${getGeminiUrl(model, "streamGenerateContent")}?alt=sse&key=${GEMINI_API_KEY}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(buildGeminiRequestBody({ prompt, category, language, depth }))
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

                const normalizedError = normalizeGeminiError(data, response.status);
                completed = true;
                return res.status(response.status).json(normalizedError);
            }

            streamResponse = response;
            streamModel = model;
            break;
        }

        if (!streamResponse) {
            const normalizedError = normalizeGeminiError(lastError?.data, lastError?.response?.status || 502);
            completed = true;
            return res.status(lastError?.response?.status || 502).json(normalizedError);
        }

        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        });
        res.flushHeaders?.();

        let sentText = false;

        await streamGeminiText(streamResponse, text => {
            sentText = true;
            writeSse(res, "chunk", text);
        });

        if (sentText) {
            writeSse(res, "done", { model: streamModel });
        } else {
            writeSse(res, "error", {
                status: "EMPTY_RESPONSE",
                message: "Gemini returned an empty response."
            });
        }

        completed = true;
        return res.end();
    } catch (error) {
        completed = true;

        if (error.name === "AbortError") {
            return undefined;
        }

        const payload = {
            status: "NETWORK_ERROR",
            message: error.message || "The server could not reach Gemini."
        };

        if (res.headersSent) {
            if (!res.writableEnded) {
                writeSse(res, "error", payload);
                res.end();
            }
            return undefined;
        }

        return res.status(502).json(payload);
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
    console.log(`NotesGPT running on port ${PORT}`);
});
