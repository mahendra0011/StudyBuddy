const express = require("express");
const multer = require("multer");
const { generateNotes, createGeminiStream, streamGeminiText } = require("../services/geminiService");
const { extractPdfTextFromBuffer } = require("../services/pdfService");
const { getYouTubeVideo } = require("../services/youtubeService");

const router = express.Router();
const PDF_UPLOAD_LIMIT_BYTES = 12 * 1024 * 1024;

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: PDF_UPLOAD_LIMIT_BYTES }
});

function validatePrompt(req, res, next) {
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
        return res.status(400).json({
            status: "BAD_REQUEST",
            message: "Prompt is required."
        });
    }

    return next();
}

function sendError(res, error) {
    return res.status(error.statusCode || 502).json(error.payload || {
        status: "SERVER_ERROR",
        message: error.message || "Something went wrong."
    });
}

function writeSse(res, event, data) {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
}

router.post("/generate", validatePrompt, async (req, res) => {
    try {
        const result = await generateNotes(req.body || {});
        return res.json(result);
    } catch (error) {
        return sendError(res, error);
    }
});

router.post("/generate/stream", validatePrompt, async (req, res) => {
    try {
        const { response, model } = await createGeminiStream(req.body || {});

        res.writeHead(200, {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        });
        res.flushHeaders?.();

        let sentText = false;

        await streamGeminiText(response, text => {
            sentText = true;
            writeSse(res, "chunk", text);
        });

        if (sentText) {
            writeSse(res, "done", { model });
        } else {
            writeSse(res, "error", {
                status: "EMPTY_RESPONSE",
                message: "Gemini returned an empty response."
            });
        }

        return res.end();
    } catch (error) {
        if (res.headersSent) {
            writeSse(res, "error", error.payload || {
                status: "NETWORK_ERROR",
                message: error.message || "The server could not reach Gemini."
            });
            return res.end();
        }

        return sendError(res, error);
    }
});

router.post("/youtube", async (req, res) => {
    try {
        const video = await getYouTubeVideo(req.body?.url);
        return res.json(video);
    } catch (error) {
        return sendError(res, error);
    }
});

router.post("/pdf-text", upload.single("pdf"), async (req, res) => {
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

router.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        return res.status(413).json({
            status: "UPLOAD_TOO_LARGE",
            message: "PDF upload is too large. Use a file under 12 MB."
        });
    }

    return next(error);
});

module.exports = router;
