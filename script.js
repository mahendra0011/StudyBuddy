const GEMINI_API_KEY = "AIzaSyALmu96q6hLhylpJ-xuepTbBHSVIuJDcNw";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

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

function buildPrompt({ prompt, category, language, depth }) {
    return [
        `Create ${depth} for a college student.`,
        `Category: ${category}`,
        `Student request: ${prompt}`,
        `Language: ${language}`,
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

async function generateNotes(formData) {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            contents: [{
                parts: [{ text: buildPrompt(formData) }]
            }],
            generationConfig: {
                temperature: 0.55,
                topP: 0.9,
                maxOutputTokens: 5000
            }
        })
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = errorData.error?.status;
        const message = errorData.error?.message || `Request failed with status ${response.status}`;
        throw new Error(status ? `${status}: ${message}` : message);
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("\n").trim();

    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    return text;
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
            <div class="loading-state">
                <div class="loading-spinner"></div>
                <p>Generating your notes...</p>
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

    if (normalized.includes("api key") || normalized.includes("permission") || normalized.includes("unauthorized")) {
        return "Gemini rejected the API key. Check that the key is active and allowed to use the Gemini API.";
    }

    if (normalized.includes("failed to fetch") || normalized.includes("network")) {
        return "The browser could not reach Gemini. Check your internet connection and try again.";
    }

    return "Failed to generate notes. Please try again in a moment.";
}

function renderNotes(formData, notes) {
    const safeTitle = escapeHTML(getShortTitle(formData.prompt, formData.category));
    const safeCategory = escapeHTML(formData.category);
    const safeLanguage = escapeHTML(formData.language);
    const safeDepth = escapeHTML(formData.depth);

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
            <div class="notes-content">
                ${markdownToHTML(notes)}
            </div>
        </article>
    `;
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
        const notes = await generateNotes(formData);
        setResultState("success", renderNotes(formData, notes));
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
