const express = require("express");
const multer = require("multer");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4173;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash-latest";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_MODEL_FALLBACKS = ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-001"];
const GEMINI_REQUEST_TIMEOUT_MS = 30000;
const GEMINI_STREAM_IDLE_TIMEOUT_MS = 15000;
const PDF_UPLOAD_LIMIT_BYTES = 12 * 1024 * 1024;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PDF_UPLOAD_LIMIT_BYTES }
});

function getGeminiModelCandidates() {
    return Array.from(new Set([GEMINI_MODEL, ...GEMINI_MODEL_FALLBACKS].filter(Boolean)));
}

function getGeminiUrl(model, method) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}`;
}

function getYouTubeVideoId(value = "") {
    const input = String(value).trim();

    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return input;
    }

    try {
        const url = new URL(input);

        if (url.hostname.includes("youtu.be")) {
            return url.pathname.split("/").filter(Boolean)[0] || "";
        }

        if (url.hostname.includes("youtube.com")) {
            const fromQuery = url.searchParams.get("v");
            if (fromQuery) {
                return fromQuery;
            }

            const parts = url.pathname.split("/").filter(Boolean);
            const shortPaths = ["embed", "shorts", "live"];
            const pathIndex = shortPaths.findIndex(part => parts.includes(part));

            if (pathIndex !== -1) {
                const marker = shortPaths[pathIndex];
                const markerIndex = parts.indexOf(marker);
                return parts[markerIndex + 1] || "";
            }
        }
    } catch (error) {
        return "";
    }

    return "";
}

function normalizeDuration(value = "") {
    const match = value.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);

    if (!match) {
        return "";
    }

    const hours = Number(match[1] || 0);
    const minutes = Number(match[2] || 0);
    const seconds = Number(match[3] || 0);
    const parts = [];

    if (hours) {
        parts.push(String(hours));
    }

    parts.push(String(minutes).padStart(hours ? 2 : 1, "0"));
    parts.push(String(seconds).padStart(2, "0"));

    return parts.join(":");
}

function getMaxOutputTokens(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return 1000;
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return 3200;
    }

    return 2200;
}

function getTargetLength(depth) {
    const normalizedDepth = String(depth || "").toLowerCase();

    if (normalizedDepth.includes("quick") || normalizedDepth.includes("short")) {
        return "Target length: 250-400 words.";
    }

    if (normalizedDepth.includes("detailed") || normalizedDepth.includes("classroom")) {
        return "Target length: 900-1300 words.";
    }

    return "Target length: 600-900 words.";
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

async function extractPdfTextFromBuffer(buffer) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        disableWorker: true
    }).promise;
    const pageLimit = Math.min(pdf.numPages, 35);
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pageLimit; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items
            .map(item => item.str || "")
            .join(" ")
            .replace(/\s+/g, " ")
            .trim();

        if (pageText) {
            pages.push(`Page ${pageNumber}: ${pageText}`);
        }
    }

    return {
        text: pages.join("\n\n"),
        pageCount: pdf.numPages,
        pageLimit
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

app.post("/api/youtube", async (req, res) => {
    const { url } = req.body || {};
    const videoId = getYouTubeVideoId(url);

    if (!videoId) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "A valid YouTube video URL is required."
        });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

    if (!YOUTUBE_API_KEY) {
        return res.json({
            videoId,
            url: videoUrl,
            warning: "YOUTUBE_API_KEY is not configured on the server."
        });
    }

    try {
        const apiUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
        apiUrl.searchParams.set("part", "snippet,contentDetails");
        apiUrl.searchParams.set("id", videoId);
        apiUrl.searchParams.set("key", YOUTUBE_API_KEY);

        const response = await fetchWithTimeout(apiUrl.toString());
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            return res.status(response.status).json({
                status: data?.error?.status || "YOUTUBE_ERROR",
                message: data?.error?.message || `YouTube request failed with status ${response.status}`
            });
        }

        const video = data?.items?.[0];

        if (!video) {
            return res.status(404).json({
                status: "NOT_FOUND",
                message: "YouTube video was not found."
            });
        }

        return res.json({
            videoId,
            url: videoUrl,
            title: video.snippet?.title || "",
            channelTitle: video.snippet?.channelTitle || "",
            description: video.snippet?.description || "",
            publishedAt: video.snippet?.publishedAt || "",
            duration: normalizeDuration(video.contentDetails?.duration || "")
        });
    } catch (error) {
        return res.status(502).json({
            status: "NETWORK_ERROR",
            message: error.message || "The server could not reach YouTube."
        });
    }
});

app.post("/api/pdf-text", upload.single("pdf"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "A PDF file is required."
        });
    }

    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "Please upload a valid PDF file."
        });
    }

    try {
        const extracted = await extractPdfTextFromBuffer(req.file.buffer);

        if (!extracted.text.trim()) {
            return res.status(422).json({
                status: "EMPTY_PDF",
                message: "No readable text was found in this PDF."
            });
        }

        return res.json({
            fileName: req.file.originalname,
            ...extracted
        });
    } catch (error) {
        return res.status(422).json({
            status: "PDF_PARSE_ERROR",
            message: error.message || "Could not read this PDF."
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

app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(413).json({
            status: "UPLOAD_TOO_LARGE",
            message: "PDF upload is too large. Use a file under 12 MB."
        });
    }

    return next(error);
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
    console.log(`NotesGPT running on port ${PORT}`);
});
