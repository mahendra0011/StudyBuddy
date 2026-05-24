const state = {
    activeLectureFilter: "all",
    activePrompt: ""
};

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function formatInline(value) {
    return value
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
}

function parseMarkdownTable(lines, startIndex) {
    const tableLines = [];
    let index = startIndex;

    while (index < lines.length && lines[index].includes("|")) {
        tableLines.push(lines[index]);
        index += 1;
    }

    if (tableLines.length < 2 || !tableLines[1].replace(/\|/g, "").trim().match(/^:?-{3,}:?(\s*:?-{3,}:?)*$/)) {
        return null;
    }

    const rows = tableLines
        .filter((line, rowIndex) => rowIndex !== 1)
        .map(line => line.trim().replace(/^\||\|$/g, "").split("|").map(cell => formatInline(cell.trim())));

    const head = rows.shift() || [];
    const body = rows;
    const headerHTML = head.map(cell => `<th>${cell}</th>`).join("");
    const bodyHTML = body
        .map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join("")}</tr>`)
        .join("");

    return {
        html: `<table><thead><tr>${headerHTML}</tr></thead><tbody>${bodyHTML}</tbody></table>`,
        nextIndex: index
    };
}

function markdownToHTML(markdown) {
    const lines = escapeHTML(markdown).replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let listType = null;

    const closeList = () => {
        if (listType) {
            html.push(`</${listType}>`);
            listType = null;
        }
    };

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();

        if (!line) {
            closeList();
            continue;
        }

        const table = parseMarkdownTable(lines, index);
        if (table) {
            closeList();
            html.push(table.html);
            index = table.nextIndex - 1;
            continue;
        }

        if (line.startsWith("### ")) {
            closeList();
            html.push(`<h3>${formatInline(line.slice(4))}</h3>`);
            continue;
        }

        if (line.startsWith("## ")) {
            closeList();
            html.push(`<h2>${formatInline(line.slice(3))}</h2>`);
            continue;
        }

        if (line.startsWith("# ")) {
            closeList();
            html.push(`<h1>${formatInline(line.slice(2))}</h1>`);
            continue;
        }

        const orderedMatch = line.match(/^\d+\.\s+(.*)$/);
        if (orderedMatch) {
            if (listType !== "ol") {
                closeList();
                listType = "ol";
                html.push("<ol>");
            }
            html.push(`<li>${formatInline(orderedMatch[1])}</li>`);
            continue;
        }

        const bulletMatch = line.match(/^[-*\u2022]\s+(.*)$/);
        if (bulletMatch) {
            if (listType !== "ul") {
                closeList();
                listType = "ul";
                html.push("<ul>");
            }
            html.push(`<li>${formatInline(bulletMatch[1])}</li>`);
            continue;
        }

        closeList();
        html.push(`<p>${formatInline(line)}</p>`);
    }

    closeList();
    return html.join("");
}

function getShortTitle(prompt, category) {
    const compactPrompt = prompt.replace(/\s+/g, " ").trim();
    const title = compactPrompt
        .replace(/^generate\s+/i, "")
        .replace(/^make\s+/i, "")
        .replace(/^create\s+/i, "")
        .slice(0, 82);

    return title || `${category} notes`;
}

async function generateNotes(formData) {
    const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = errorData.status || errorData.error?.status;
        const message = errorData.message || errorData.error?.message || `Request failed with status ${response.status}`;
        throw new Error(status ? `${status}: ${message}` : message);
    }

    const data = await response.json();
    const text = data?.text?.trim();

    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text;
}

function parseNotesStreamEvent(rawEvent) {
    let eventName = "message";
    const dataLines = [];

    rawEvent.split(/\r?\n/).forEach(line => {
        if (line.startsWith("event:")) {
            eventName = line.slice(6).trim();
        }

        if (line.startsWith("data:")) {
            dataLines.push(line.slice(5).trimStart());
        }
    });

    if (!dataLines.length) {
        return null;
    }

    const rawData = dataLines.join("\n");
    let data = rawData;

    try {
        data = JSON.parse(rawData);
    } catch (error) {
        data = rawData;
    }

    return { eventName, data };
}

async function streamNotes(formData, onChunk) {
    const response = await fetch("/api/generate/stream", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = errorData.status || errorData.error?.status;
        const message = errorData.message || errorData.error?.message || `Request failed with status ${response.status}`;
        throw new Error(status ? `${status}: ${message}` : message);
    }

    if (!response.body) {
        const text = await generateNotes(formData);
        onChunk(text);
        return text;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";
    let streamError = null;

    const handleEvent = rawEvent => {
        const parsed = parseNotesStreamEvent(rawEvent);

        if (!parsed) {
            return false;
        }

        if (parsed.eventName === "chunk") {
            const text = typeof parsed.data === "string" ? parsed.data : parsed.data?.text || "";

            if (text) {
                fullText += text;
                onChunk(text);
            }
        }

        if (parsed.eventName === "error") {
            const status = parsed.data?.status;
            const message = parsed.data?.message || "Gemini stream failed.";
            streamError = new Error(status ? `${status}: ${message}` : message);
        }

        return parsed.eventName === "done";
    };

    while (true) {
        const { done, value } = await reader.read();

        if (value) {
            buffer += decoder.decode(value, { stream: !done });
            const events = buffer.split(/\r?\n\r?\n/);
            buffer = events.pop() || "";

            for (const event of events) {
                if (handleEvent(event)) {
                    await reader.cancel().catch(() => {});
                    return fullText;
                }

                if (streamError) {
                    throw streamError;
                }
            }
        }

        if (done) {
            break;
        }
    }

    buffer += decoder.decode();

    if (buffer.trim()) {
        handleEvent(buffer);
    }

    if (streamError) {
        throw streamError;
    }

    return fullText;
}

function getHomeFormData() {
    return {
        prompt: document.getElementById("notePrompt")?.value.trim() || "",
        category: document.getElementById("categorySelect")?.value || "General",
        language: document.getElementById("languageSelect")?.value || "English",
        depth: document.getElementById("depthSelect")?.value || "exam revision"
    };
}

function setResultState(type, content = "") {
    const emptyState = document.getElementById("emptyState");
    const results = document.getElementById("searchResults");
    const resultText = document.getElementById("resultText");
    const downloadButton = document.getElementById("downloadButton");

    if (!results || !resultText) {
        return;
    }

    emptyState?.classList.add("hidden");
    results.classList.remove("hidden");
    downloadButton?.setAttribute("disabled", "true");

    if (type === "loading") {
        resultText.innerHTML = `
            <div class="ai-generating-card" role="status" aria-live="polite">
                <div class="ai-generating-header">
                    <div class="ai-avatar">
                        <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
                    </div>
                    <div>
                        <strong>NotesGPT is writing</strong>
                        <p>Understanding your topic and preparing structured notes</p>
                    </div>
                    <div class="typing-dots" aria-hidden="true">
                        <span></span>
                        <span></span>
                        <span></span>
                    </div>
                </div>

                <div class="thinking-steps" aria-hidden="true">
                    <span class="active">Reading prompt</span>
                    <span>Structuring sections</span>
                    <span>Drafting notes</span>
                </div>

                <div class="stream-preview" aria-hidden="true">
                    <span class="stream-line wide"></span>
                    <span class="stream-line medium"></span>
                    <span class="stream-line short"></span>
                    <span class="stream-line wide"></span>
                    <span class="stream-line medium"></span>
                </div>
            </div>
        `;
        return;
    }

    if (type === "error") {
        resultText.innerHTML = `
            <div class="error-state">
                <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
                <p>${escapeHTML(content)}</p>
            </div>
        `;
        return;
    }

    resultText.innerHTML = content;
    downloadButton?.removeAttribute("disabled");
}

function friendlyErrorMessage(error) {
    const message = error?.message || "";
    const normalized = message.toLowerCase();

    if (normalized.includes("quota") || normalized.includes("resource_exhausted")) {
        return "Gemini is connected, but this API key has no available quota right now. Check the key's Google AI Studio quota or add billing, then try again.";
    }

    if (normalized.includes("missing_api_key") || normalized.includes("not configured")) {
        return "Gemini is not configured on the server. Add GEMINI_API_KEY in your Render environment variables and redeploy.";
    }

    if (normalized.includes("leaked")) {
        return "Gemini rejected this API key because it was reported as leaked. Create a new key in Google AI Studio, update GEMINI_API_KEY in Render, and redeploy.";
    }

    if (normalized.includes("api key") || normalized.includes("permission") || normalized.includes("unauthorized") || normalized.includes("permission_denied")) {
        return "Gemini rejected the API key. Check that the key is active and allowed to use the Gemini API.";
    }

    if (normalized.includes("not_found") || normalized.includes("not found") || normalized.includes("is not supported")) {
        return "The selected Gemini model is not available for this API key. Use gemini-flash-lite-latest or another model listed in Google AI Studio.";
    }

    if (normalized.includes("failed to fetch") || normalized.includes("network")) {
        return "The browser could not reach Gemini. Check your internet connection and try again.";
    }

    return "Failed to generate notes. Please try again in a moment.";
}

function renderNotesShell(formData, content = "", contentClass = "") {
    const safeTitle = escapeHTML(getShortTitle(formData.prompt, formData.category));
    const safeCategory = escapeHTML(formData.category);
    const safeLanguage = escapeHTML(formData.language);
    const safeDepth = escapeHTML(formData.depth);
    const className = ["notes-content", contentClass].filter(Boolean).join(" ");

    return `
        <article class="notes-container" id="notesContent">
            <header class="notes-header">
                <div>
                    <span>Generated study notes</span>
                    <h2>${safeTitle}</h2>
                    <p>${safeCategory}</p>
                </div>
                <div class="notes-meta">
                    <b>${safeLanguage}</b>
                    <b>${safeDepth}</b>
                </div>
            </header>
            <div class="${className}" id="notesContentBody">
                ${content}
            </div>
        </article>
    `;
}

function renderNotes(formData, notes) {
    return renderNotesShell(formData, markdownToHTML(notes));
}

function wait(ms) {
    return new Promise(resolve => {
        window.setTimeout(resolve, ms);
    });
}

function getLiveTypingChunkSize(pendingLength) {
    if (pendingLength > 220) {
        return 12;
    }

    if (pendingLength > 80) {
        return 7;
    }

    return 3;
}

function getLiveTypingDelay(pendingLength) {
    if (pendingLength > 220) {
        return 4;
    }

    if (pendingLength > 80) {
        return 8;
    }

    return 14;
}

async function streamNotesToPage(formData) {
    let target = null;
    let downloadButton = null;
    let shellVisible = false;
    let pendingText = "";
    let renderedText = "";
    let isTyping = false;
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const showNotesShell = () => {
        if (shellVisible) {
            return;
        }

        setResultState("success", renderNotesShell(formData, "", "writing-content"));
        downloadButton = document.getElementById("downloadButton");
        target = document.getElementById("notesContentBody");
        downloadButton?.setAttribute("disabled", "true");
        shellVisible = true;
    };

    const paintNotes = () => {
        if (target) {
            target.innerHTML = markdownToHTML(renderedText);
        }
    };

    const flushPendingText = () => {
        if (!pendingText) {
            return;
        }

        renderedText += pendingText;
        pendingText = "";
        paintNotes();
    };

    const typePendingText = async () => {
        if (isTyping || !target) {
            return;
        }

        isTyping = true;

        while (pendingText) {
            const chunkSize = getLiveTypingChunkSize(pendingText.length);
            renderedText += pendingText.slice(0, chunkSize);
            pendingText = pendingText.slice(chunkSize);
            paintNotes();
            await wait(getLiveTypingDelay(pendingText.length));
        }

        isTyping = false;
    };

    const addStreamChunk = text => {
        if (!text) {
            return;
        }

        showNotesShell();
        pendingText += text;

        if (prefersReducedMotion) {
            flushPendingText();
            return;
        }

        void typePendingText();
    };

    const streamedText = await streamNotes(formData, addStreamChunk);
    showNotesShell();

    while (isTyping || pendingText) {
        await wait(24);
    }

    const finalText = streamedText || renderedText;

    if (!finalText.trim()) {
        throw new Error("Gemini returned an empty response.");
    }

    renderedText = finalText;
    paintNotes();
    target?.classList.add("done");
    downloadButton?.removeAttribute("disabled");
}

function setGenerateButtonsLoading(isLoading) {
    const submitButton = document.querySelector("#notesForm button[type='submit']");
    const categoryCards = document.querySelectorAll(".note-category-card");

    if (submitButton) {
        submitButton.disabled = isLoading;
        submitButton.innerHTML = isLoading
            ? '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> Generating'
            : '<i class="fas fa-arrow-up" aria-hidden="true"></i> Generate';
    }

    categoryCards.forEach(card => {
        card.disabled = isLoading;
    });
}

async function submitNotesRequest(formData) {
    if (!formData.prompt) {
        setResultState("error", "Please write a topic or choose a category first.");
        return;
    }

    state.activePrompt = formData.prompt;
    setGenerateButtonsLoading(true);
    setResultState("loading");

    document.querySelector(".home-results")?.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
        await streamNotesToPage(formData);
    } catch (error) {
        console.warn("Notes generation failed:", error?.message || error);
        setResultState("error", friendlyErrorMessage(error));
    } finally {
        setGenerateButtonsLoading(false);
    }
}

function downloadPDF() {
    const element = document.getElementById("notesContent");

    if (!element || typeof html2pdf === "undefined") {
        return;
    }

    const prompt = state.activePrompt || document.getElementById("notePrompt")?.value.trim() || "notes";
    const filename = `${prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 42) || "notes"}-notes.pdf`;

    html2pdf().set({
        margin: 0.35,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" }
    }).from(element).save();
}

function initHomeGenerator() {
    const form = document.getElementById("notesForm");
    const promptInput = document.getElementById("notePrompt");
    const categorySelect = document.getElementById("categorySelect");
    const downloadButton = document.getElementById("downloadButton");

    if (!form || !promptInput) {
        return;
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        submitNotesRequest(getHomeFormData());
    });

    document.querySelectorAll(".note-category-card").forEach(card => {
        card.addEventListener("click", () => {
            const prompt = card.dataset.prompt || "";
            const category = card.dataset.category || "General";
            promptInput.value = prompt;

            if (categorySelect) {
                categorySelect.value = category;
            }

            document.querySelectorAll(".note-category-card").forEach(item => item.classList.toggle("selected", item === card));
            submitNotesRequest(getHomeFormData());
        });
    });

    downloadButton?.addEventListener("click", downloadPDF);
}

function initLectureFilters() {
    const search = document.getElementById("lectureSearch");
    const cards = Array.from(document.querySelectorAll(".lecture-card"));
    const noResults = document.getElementById("noLectureResults");
    const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));

    if (!cards.length) {
        return;
    }

    const applyFilters = () => {
        const query = (search?.value || "").trim().toLowerCase();
        let visibleCount = 0;

        cards.forEach(card => {
            const categoryMatch = state.activeLectureFilter === "all" || card.dataset.category === state.activeLectureFilter;
            const searchMatch = !query || (card.dataset.title || "").includes(query);
            const visible = categoryMatch && searchMatch;
            card.classList.toggle("hidden", !visible);
            visibleCount += visible ? 1 : 0;
        });

        noResults?.classList.toggle("hidden", visibleCount > 0);
    };

    filterButtons.forEach(button => {
        button.addEventListener("click", () => {
            state.activeLectureFilter = button.dataset.filter || "all";
            filterButtons.forEach(item => item.classList.toggle("active", item === button));
            applyFilters();
        });
    });

    search?.addEventListener("input", applyFilters);
    applyFilters();
}

document.addEventListener("DOMContentLoaded", () => {
    initHomeGenerator();
    initLectureFilters();
});
