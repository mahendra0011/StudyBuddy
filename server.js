const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 4173;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-lite-latest";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

function buildPrompt({ prompt, category, language, depth }) {
    return [
        `Create ${depth || "exam revision"} for a college student.`,
        `Category: ${category || "General"}`,
        `Student request: ${prompt}`,
        `Language: ${language || "English"}`,
        "",
        "Format the answer in clean Markdown.",
        "Use this exact structure:",
        "1. Short introduction",
        "2. Key concepts and definitions",
        "3. Step-by-step explanation",
        "4. Advantages and disadvantages, if relevant",
        "5. Real-world applications or examples",
        "6. Important exam points",
        "7. Glossary of technical terms",
        "",
        "Keep the answer clear, practical, and easy to revise."
    ].join("\n");
}

function normalizeGeminiError(errorData, fallbackStatus) {
    const status = errorData?.error?.status || "GEMINI_ERROR";
    const message = errorData?.error?.message || `Gemini request failed with status ${fallbackStatus}`;
    return { status, message };
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
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: buildPrompt({ prompt, category, language, depth }) }]
                }],
                generationConfig: {
                    temperature: 0.55,
                    topP: 0.9,
                    maxOutputTokens: 5000
                }
            })
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            const normalizedError = normalizeGeminiError(data, response.status);
            return res.status(response.status).json(normalizedError);
        }

        const text = data?.candidates?.[0]?.content?.parts
            ?.map(part => part.text || "")
            .join("\n")
            .trim();

        if (!text) {
            return res.status(502).json({
                status: "EMPTY_RESPONSE",
                message: "Gemini returned an empty response."
            });
        }

        return res.json({ text });
    } catch (error) {
        return res.status(502).json({
            status: "NETWORK_ERROR",
            message: error.message || "The server could not reach Gemini."
        });
    }
});

app.get("*", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
    console.log(`NotesGPT running on port ${PORT}`);
});
