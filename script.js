const state = {
    activeLectureFilter: "all",
    activePrompt: "",
    pomodoroMode: "focus",
    pomodoroRemaining: 25 * 60,
    pomodoroTimer: null,
    pomodoroRunning: false,
    focusAudio: null,
    tasks: [],
    userEmail: "",
    userName: "",
    authMode: "signup",
    customPlaylists: []
};

const STREAM_STALL_TIMEOUT_MS = 9000;
const MAX_SUMMARY_TEXT_CHARS = 28000;
const AUTH_STORAGE_KEY = "notesgpt-auth-session";
const AUTH_ACCOUNTS_STORAGE_KEY = "notesgpt-auth-accounts";
const LEGACY_AUTH_STORAGE_KEY = "notesgpt-user-email";
const TASK_STORAGE_KEY = "notesgpt-study-tasks";
const GOAL_STORAGE_KEY = "notesgpt-study-goal";
const POMODORO_DURATIONS = {
    focus: 25 * 60,
    short: 5 * 60,
    long: 15 * 60
};

function escapeHTML(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function storageSafeEmail(email) {
    return String(email || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-");
}

function getPlaylistStorageKey(email = state.userEmail) {
    return `notesgpt-playlists-${storageSafeEmail(email) || "guest"}`;
}

function getYouTubeId(value = "") {
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
            const markers = ["embed", "shorts", "live"];
            const marker = markers.find(item => parts.includes(item));

            if (marker) {
                return parts[parts.indexOf(marker) + 1] || "";
            }
        }
    } catch (error) {
        return "";
    }

    return "";
}

function getPlaylistThumbnail(url) {
    const videoId = getYouTubeId(url);
    return videoId
        ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
        : "";
}

function getDisplayName(email = state.userEmail) {
    return state.userName || String(email || "").split("@")[0] || "Student";
}

function getAuthAccounts() {
    try {
        return JSON.parse(window.localStorage.getItem(AUTH_ACCOUNTS_STORAGE_KEY) || "{}");
    } catch (error) {
        return {};
    }
}

function saveAuthAccounts(accounts) {
    window.localStorage.setItem(AUTH_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

async function hashPassword(email, password) {
    const value = `${String(email || "").trim().toLowerCase()}:${password}`;

    if (window.crypto?.subtle && window.TextEncoder) {
        const bytes = new TextEncoder().encode(value);
        const digest = await window.crypto.subtle.digest("SHA-256", bytes);
        return Array.from(new Uint8Array(digest))
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    return window.btoa(unescape(encodeURIComponent(value)));
}

function setAuthError(message) {
    const authError = document.getElementById("authError");
    if (!authError) {
        return;
    }

    authError.textContent = message;
    authError.classList.remove("hidden");
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
    const controller = new AbortController();
    let receivedChunk = false;
    let didFallback = false;
    const stallTimeout = window.setTimeout(() => {
        if (!receivedChunk) {
            controller.abort();
        }
    }, STREAM_STALL_TIMEOUT_MS);

    const runFallback = async () => {
        didFallback = true;
        const text = await generateNotes(formData);
        onChunk(text);
        return text;
    };

    let response;

    try {
        response = await fetch("/api/generate/stream", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(formData),
            signal: controller.signal
        });
    } catch (error) {
        window.clearTimeout(stallTimeout);

        if (error.name === "AbortError" && !receivedChunk) {
            return runFallback();
        }

        throw error;
    }

    if (!response.ok) {
        window.clearTimeout(stallTimeout);
        const errorData = await response.json().catch(() => ({}));
        const status = errorData.status || errorData.error?.status;
        const message = errorData.message || errorData.error?.message || `Request failed with status ${response.status}`;

        if (response.status >= 500 && status !== "MISSING_API_KEY") {
            return runFallback();
        }

        throw new Error(status ? `${status}: ${message}` : message);
    }

    if (!response.body) {
        window.clearTimeout(stallTimeout);
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
                receivedChunk = true;
                window.clearTimeout(stallTimeout);
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

    try {
        while (true) {
            const { done, value } = await reader.read();

            if (value) {
                buffer += decoder.decode(value, { stream: !done });
                const events = buffer.split(/\r?\n\r?\n/);
                buffer = events.pop() || "";

                for (const event of events) {
                    if (handleEvent(event)) {
                        window.clearTimeout(stallTimeout);
                        await reader.cancel().catch(() => {});
                        return fullText;
                    }

                    if (streamError) {
                        if (!receivedChunk) {
                            window.clearTimeout(stallTimeout);
                            return runFallback();
                        }

                        throw streamError;
                    }
                }
            }

            if (done) {
                break;
            }
        }
    } catch (error) {
        window.clearTimeout(stallTimeout);

        if (error.name === "AbortError" && !receivedChunk) {
            return runFallback();
        }

        throw error;
    }

    window.clearTimeout(stallTimeout);
    buffer += decoder.decode();

    if (buffer.trim()) {
        handleEvent(buffer);
    }

    if (streamError) {
        if (!receivedChunk) {
            window.clearTimeout(stallTimeout);
            return runFallback();
        }

        throw streamError;
    }

    if (!fullText.trim() && !didFallback) {
        return runFallback();
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
        return "The selected Gemini model is not available for this API key. Use gemini-1.5-flash-latest or another model listed in Google AI Studio.";
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

function getCurrentLanguage() {
    return document.getElementById("languageSelect")?.value || "English";
}

function getCurrentDepth() {
    return document.getElementById("depthSelect")?.value || "exam revision";
}

function trimForSummary(text) {
    const compact = String(text || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return compact.length > MAX_SUMMARY_TEXT_CHARS
        ? `${compact.slice(0, MAX_SUMMARY_TEXT_CHARS)}\n\n[Text trimmed for length]`
        : compact;
}

function setButtonBusy(button, isBusy, busyLabel = "Working") {
    if (!button) {
        return;
    }

    if (!button.dataset.defaultHtml) {
        button.dataset.defaultHtml = button.innerHTML;
    }

    button.disabled = isBusy;
    button.innerHTML = isBusy
        ? `<i class="fas fa-spinner fa-spin" aria-hidden="true"></i> ${busyLabel}`
        : button.dataset.defaultHtml;
}

async function extractPdfText(file) {
    if (!file) {
        throw new Error("Please choose a PDF file first.");
    }

    const formData = new FormData();
    formData.append("pdf", file);

    const response = await fetch("/api/pdf-text", {
        method: "POST",
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const status = errorData.status || "PDF_ERROR";
        const message = errorData.message || `PDF request failed with status ${response.status}`;
        throw new Error(`${status}: ${message}`);
    }

    const data = await response.json();
    const text = trimForSummary(data.text || "");

    if (!text.trim()) {
        throw new Error("No readable text was found in this PDF.");
    }

    return {
        text,
        pageCount: data.pageCount || 0,
        pageLimit: data.pageLimit || 0
    };
}

async function summarizePdf() {
    const input = document.getElementById("pdfInput");
    const button = document.getElementById("summarizePdfButton");
    const file = input?.files?.[0];

    try {
        setButtonBusy(button, true, "Reading PDF");
        const extracted = await extractPdfText(file);
        const prompt = [
            `Summarize this PDF for a student: ${file.name}`,
            `Pages read: ${extracted.pageLimit} of ${extracted.pageCount}`,
            "",
            "Create clear study notes with:",
            "1. Overview",
            "2. Key concepts",
            "3. Important points",
            "4. Examples or formulas",
            "5. Exam tips",
            "",
            "PDF text:",
            extracted.text
        ].join("\n");

        setButtonBusy(button, true, "Generating");
        await submitNotesRequest({
            prompt,
            category: "PDF Summary",
            language: getCurrentLanguage(),
            depth: getCurrentDepth()
        });
    } catch (error) {
        setResultState("error", friendlyErrorMessage(error));
    } finally {
        setButtonBusy(button, false);
    }
}

async function fetchYoutubeMetadata(url) {
    const response = await fetch("/api/youtube", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ url })
    });

    if (!response.ok) {
        return { url };
    }

    return response.json();
}

function buildYoutubePrompt(url, metadata, notes) {
    const details = [
        metadata?.title ? `Title: ${metadata.title}` : "",
        metadata?.channelTitle ? `Channel: ${metadata.channelTitle}` : "",
        metadata?.duration ? `Duration: ${metadata.duration}` : "",
        metadata?.description ? `Description: ${trimForSummary(metadata.description)}` : "",
        notes ? `Transcript or notes: ${trimForSummary(notes)}` : ""
    ].filter(Boolean).join("\n");

    return [
        "Create study notes from this YouTube lecture.",
        `Lecture URL: ${metadata?.url || url}`,
        "",
        details || "No metadata was available.",
        "",
        "Use this format:",
        "1. Lecture overview",
        "2. Key concepts",
        "3. Timeline or topic flow",
        "4. Important examples",
        "5. Exam/revision points",
        "",
        notes
            ? "Use the transcript or notes as the primary source."
            : "If a transcript is not available, use the title and description, and keep the summary clear about what can be inferred."
    ].join("\n");
}

async function summarizeYoutubeLecture() {
    const urlInput = document.getElementById("youtubeUrlInput");
    const notesInput = document.getElementById("youtubeNotesInput");
    const button = document.getElementById("summarizeYoutubeButton");
    const url = urlInput?.value.trim() || "";
    const notes = notesInput?.value.trim() || "";

    if (!url) {
        setResultState("error", "Please paste a YouTube lecture link first.");
        return;
    }

    try {
        setButtonBusy(button, true, "Reading");
        const metadata = await fetchYoutubeMetadata(url);
        const prompt = buildYoutubePrompt(url, metadata, notes);

        setButtonBusy(button, true, "Generating");
        await submitNotesRequest({
            prompt,
            category: "YouTube Lecture",
            language: getCurrentLanguage(),
            depth: getCurrentDepth()
        });
    } catch (error) {
        setResultState("error", friendlyErrorMessage(error));
    } finally {
        setButtonBusy(button, false);
    }
}

function formatTimer(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function updatePomodoroDisplay() {
    const display = document.getElementById("pomodoroTime");
    const startButton = document.getElementById("pomodoroStartButton");

    if (display) {
        display.textContent = formatTimer(state.pomodoroRemaining);
    }

    if (startButton) {
        startButton.innerHTML = state.pomodoroRunning
            ? '<i class="fas fa-pause" aria-hidden="true"></i> Pause'
            : '<i class="fas fa-play" aria-hidden="true"></i> Start';
    }
}

function stopPomodoro() {
    if (state.pomodoroTimer) {
        window.clearInterval(state.pomodoroTimer);
        state.pomodoroTimer = null;
    }

    state.pomodoroRunning = false;
    updatePomodoroDisplay();
}

function setPomodoroMode(mode) {
    state.pomodoroMode = mode;
    state.pomodoroRemaining = POMODORO_DURATIONS[mode] || POMODORO_DURATIONS.focus;
    stopPomodoro();
    document.querySelectorAll("[data-pomodoro-mode]").forEach(button => {
        button.classList.toggle("active", button.dataset.pomodoroMode === mode);
    });
    updatePomodoroDisplay();
}

function togglePomodoro() {
    if (state.pomodoroRunning) {
        stopPomodoro();
        return;
    }

    state.pomodoroRunning = true;
    state.pomodoroTimer = window.setInterval(() => {
        state.pomodoroRemaining = Math.max(0, state.pomodoroRemaining - 1);
        updatePomodoroDisplay();

        if (state.pomodoroRemaining === 0) {
            stopPomodoro();
        }
    }, 1000);
    updatePomodoroDisplay();
}

function loadStudyTasks() {
    try {
        state.tasks = JSON.parse(window.localStorage.getItem(TASK_STORAGE_KEY) || "[]");
    } catch (error) {
        state.tasks = [];
    }

    const goalInput = document.getElementById("studyGoalInput");
    if (goalInput) {
        goalInput.value = window.localStorage.getItem(GOAL_STORAGE_KEY) || "";
    }
}

function saveStudyTasks() {
    window.localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(state.tasks));
}

function renderStudyTasks() {
    const list = document.getElementById("taskList");

    if (!list) {
        return;
    }

    if (!state.tasks.length) {
        list.innerHTML = '<li class="empty-task">No tasks yet.</li>';
        return;
    }

    list.innerHTML = state.tasks.map(task => `
        <li class="${task.done ? "done" : ""}" data-task-id="${escapeHTML(task.id)}">
            <label>
                <input type="checkbox" ${task.done ? "checked" : ""}>
                <span>${escapeHTML(task.text)}</span>
            </label>
            <button type="button" title="Delete task">
                <i class="fas fa-xmark" aria-hidden="true"></i>
            </button>
        </li>
    `).join("");
}

function addStudyTask() {
    const input = document.getElementById("studyTaskInput");
    const text = input?.value.trim() || "";

    if (!text) {
        return;
    }

    state.tasks.unshift({
        id: window.crypto?.randomUUID?.() || `${Date.now()}`,
        text,
        done: false
    });
    input.value = "";
    saveStudyTasks();
    renderStudyTasks();
}

function createNoiseBuffer(context) {
    const bufferSize = context.sampleRate * 2;
    const buffer = context.createBuffer(1, bufferSize, context.sampleRate);
    const output = buffer.getChannelData(0);
    let last = 0;

    for (let index = 0; index < bufferSize; index += 1) {
        const white = Math.random() * 2 - 1;
        last = (last + (0.02 * white)) / 1.02;
        output[index] = last * 3.5;
    }

    return buffer;
}

function stopFocusMusic() {
    if (!state.focusAudio) {
        return;
    }

    state.focusAudio.nodes.forEach(node => {
        try {
            node.stop?.();
        } catch (error) {
            // Already stopped.
        }
        node.disconnect?.();
    });
    state.focusAudio.context.close?.();
    state.focusAudio = null;

    const button = document.getElementById("focusMusicButton");
    if (button) {
        button.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i> Play Focus';
    }
}

async function startFocusMusic() {
    stopFocusMusic();

    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) {
        setResultState("error", "Focus music is not supported in this browser.");
        return;
    }

    const sound = document.getElementById("focusSoundSelect")?.value || "rain";
    const volume = Number(document.getElementById("focusVolumeInput")?.value || 35) / 100;
    const context = new AudioContextConstructor();
    const gain = context.createGain();
    gain.gain.value = Math.max(0.02, volume * 0.35);
    gain.connect(context.destination);

    const nodes = [gain];

    if (sound === "deep") {
        const oscillator = context.createOscillator();
        const filter = context.createBiquadFilter();
        oscillator.type = "sine";
        oscillator.frequency.value = 96;
        filter.type = "lowpass";
        filter.frequency.value = 420;
        oscillator.connect(filter).connect(gain);
        oscillator.start();
        nodes.push(oscillator, filter);
    } else {
        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        source.buffer = createNoiseBuffer(context);
        source.loop = true;
        filter.type = sound === "white" ? "highpass" : "lowpass";
        filter.frequency.value = sound === "white" ? 900 : 950;
        source.connect(filter).connect(gain);
        source.start();
        nodes.push(source, filter);
    }

    state.focusAudio = { context, nodes, gain };

    const button = document.getElementById("focusMusicButton");
    if (button) {
        button.innerHTML = '<i class="fas fa-stop" aria-hidden="true"></i> Stop Focus';
    }
}

function updateFocusVolume() {
    if (!state.focusAudio?.gain) {
        return;
    }

    const volume = Number(document.getElementById("focusVolumeInput")?.value || 35) / 100;
    state.focusAudio.gain.gain.value = Math.max(0.02, volume * 0.35);
}

function loadAuthState() {
    state.userEmail = "";
    state.userName = "";

    try {
        const session = JSON.parse(window.localStorage.getItem(AUTH_STORAGE_KEY) || "null");
        if (session?.email) {
            state.userEmail = String(session.email).trim().toLowerCase();
            state.userName = String(session.name || "").trim();
            return;
        }
    } catch (error) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }

    const legacyEmail = window.localStorage.getItem(LEGACY_AUTH_STORAGE_KEY) || "";
    if (legacyEmail) {
        state.userEmail = legacyEmail.trim().toLowerCase();
        state.userName = getDisplayName(state.userEmail);
        window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            email: state.userEmail,
            name: state.userName
        }));
        window.localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }
}

function saveAuthState(account) {
    state.userEmail = String(account.email || "").trim().toLowerCase();
    state.userName = String(account.name || "").trim();
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
        email: state.userEmail,
        name: state.userName
    }));
    loadCustomPlaylists();
    updateAuthUI();
    renderCustomPlaylists();
}

function clearAuthState() {
    state.userEmail = "";
    state.userName = "";
    state.customPlaylists = [];
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
    updateAuthUI();
    renderCustomPlaylists();
}

function setAuthMode(mode) {
    state.authMode = mode === "login" ? "login" : "signup";
    document.getElementById("authError")?.classList.add("hidden");
    updateAuthUI();
}

function openAuthModal() {
    const modal = document.getElementById("authModal");
    const nameInput = document.getElementById("authNameInput");
    const emailInput = document.getElementById("authEmailInput");
    const authError = document.getElementById("authError");

    modal?.classList.remove("hidden");
    authError?.classList.add("hidden");
    updateAuthUI();

    const targetInput = state.authMode === "signup" ? nameInput : emailInput;
    window.setTimeout(() => targetInput?.focus(), 50);
}

function closeAuthModal() {
    document.getElementById("authModal")?.classList.add("hidden");
}

function updateAuthUI() {
    const authButton = document.getElementById("authButton");
    const authForm = document.getElementById("authForm");
    const signOutButton = document.getElementById("signOutButton");
    const description = document.getElementById("authDescription");
    const title = document.getElementById("authTitle");
    const nameInput = document.getElementById("authNameInput");
    const emailInput = document.getElementById("authEmailInput");
    const passwordInput = document.getElementById("authPasswordInput");
    const submitButton = document.getElementById("authSubmitButton");
    const badge = document.getElementById("playlistUserBadge");
    const playlistForm = document.getElementById("playlistForm");
    const authTabs = document.querySelectorAll("[data-auth-mode]");
    const signedInName = getDisplayName();

    if (authButton) {
        authButton.innerHTML = state.userEmail
            ? `<i class="fas fa-user-check" aria-hidden="true"></i><span>${escapeHTML(signedInName)}</span>`
            : '<i class="fas fa-user" aria-hidden="true"></i><span>Sign in</span>';
        authButton.setAttribute("aria-label", state.userEmail ? `Signed in as ${signedInName}` : "Sign in or create account");
    }

    if (title) {
        title.textContent = state.userEmail
            ? "Account active"
            : state.authMode === "login"
                ? "Log in to NotesGPT"
                : "Create your account";
    }

    if (description) {
        description.textContent = state.userEmail
            ? `You are signed in as ${signedInName} (${state.userEmail}).`
            : state.authMode === "login"
                ? "Enter your email and password to continue your study session."
                : "Add your name, email, and password to save your playlists on this device.";
    }

    authTabs.forEach(tab => {
        tab.classList.toggle("active", tab.dataset.authMode === state.authMode);
    });

    authForm?.classList.toggle("hidden", Boolean(state.userEmail));
    signOutButton?.classList.toggle("hidden", !state.userEmail);

    if (nameInput) {
        nameInput.classList.toggle("hidden", state.authMode === "login");
        nameInput.required = state.authMode === "signup";
    }

    if (passwordInput) {
        passwordInput.autocomplete = state.authMode === "login" ? "current-password" : "new-password";
    }

    if (submitButton) {
        submitButton.innerHTML = state.authMode === "login"
            ? '<i class="fas fa-arrow-right-to-bracket" aria-hidden="true"></i> Log in'
            : '<i class="fas fa-arrow-right" aria-hidden="true"></i> Create account';
    }

    if (!state.userEmail) {
        if (emailInput) {
            emailInput.value = "";
        }
        if (passwordInput) {
            passwordInput.value = "";
        }
        if (nameInput && state.authMode === "signup") {
            nameInput.value = "";
        }
    }

    if (badge) {
        badge.textContent = state.userEmail ? signedInName : "Sign in required";
    }

    playlistForm?.classList.toggle("disabled", !state.userEmail);
}

async function handleAuthSubmit() {
    const nameInput = document.getElementById("authNameInput");
    const emailInput = document.getElementById("authEmailInput");
    const passwordInput = document.getElementById("authPasswordInput");
    const name = nameInput?.value.trim() || "";
    const email = emailInput?.value.trim().toLowerCase() || "";
    const password = passwordInput?.value || "";

    if (!isValidEmail(email)) {
        setAuthError("Please enter a valid email address.");
        return;
    }

    if (password.length < 6) {
        setAuthError("Password must be at least 6 characters.");
        return;
    }

    const accounts = getAuthAccounts();
    const passwordHash = await hashPassword(email, password);

    if (state.authMode === "signup") {
        if (name.length < 2) {
            setAuthError("Please enter your name.");
            return;
        }

        if (accounts[email]) {
            setAuthError("This email already has an account. Use Log in.");
            return;
        }

        accounts[email] = {
            email,
            name,
            passwordHash,
            createdAt: new Date().toISOString()
        };
        saveAuthAccounts(accounts);
        saveAuthState(accounts[email]);
        closeAuthModal();
        return;
    }

    const account = accounts[email];
    if (!account || account.passwordHash !== passwordHash) {
        setAuthError("Email or password is incorrect.");
        return;
    }

    saveAuthState(account);
    closeAuthModal();
}

function initAuth() {
    loadAuthState();
    loadCustomPlaylists();
    updateAuthUI();

    const authButton = document.getElementById("authButton");
    const authCloseButton = document.getElementById("authCloseButton");
    const authModal = document.getElementById("authModal");
    const authForm = document.getElementById("authForm");
    const signOutButton = document.getElementById("signOutButton");

    authButton?.addEventListener("click", openAuthModal);
    authCloseButton?.addEventListener("click", closeAuthModal);
    authModal?.addEventListener("click", event => {
        if (event.target === authModal) {
            closeAuthModal();
        }
    });

    document.querySelectorAll("[data-auth-mode]").forEach(button => {
        button.addEventListener("click", () => {
            setAuthMode(button.dataset.authMode || "signup");
        });
    });

    authForm?.addEventListener("submit", async event => {
        event.preventDefault();
        await handleAuthSubmit();
    });

    signOutButton?.addEventListener("click", () => {
        clearAuthState();
        closeAuthModal();
    });
}

function loadCustomPlaylists() {
    if (!state.userEmail) {
        state.customPlaylists = [];
        return;
    }

    try {
        state.customPlaylists = JSON.parse(window.localStorage.getItem(getPlaylistStorageKey()) || "[]");
    } catch (error) {
        state.customPlaylists = [];
    }
}

function saveCustomPlaylists() {
    if (!state.userEmail) {
        return;
    }

    window.localStorage.setItem(getPlaylistStorageKey(), JSON.stringify(state.customPlaylists));
}

function renderCustomPlaylists() {
    const grid = document.getElementById("customPlaylistGrid");
    const empty = document.getElementById("customPlaylistEmpty");

    if (!grid || !empty) {
        return;
    }

    if (!state.userEmail) {
        grid.innerHTML = "";
        empty.textContent = "Sign in with email to save your own playlists.";
        empty.classList.remove("hidden");
        return;
    }

    if (!state.customPlaylists.length) {
        grid.innerHTML = "";
        empty.textContent = "No custom playlists yet.";
        empty.classList.remove("hidden");
        return;
    }

    empty.classList.add("hidden");
    grid.innerHTML = state.customPlaylists.map(playlist => {
        const thumbnail = playlist.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80";
        return `
            <article class="lecture-card custom-playlist-card" data-playlist-id="${escapeHTML(playlist.id)}">
                <a class="lecture-thumb" href="${escapeHTML(playlist.url)}" target="_blank" rel="noopener" aria-label="Open ${escapeHTML(playlist.title)}">
                    <img src="${escapeHTML(thumbnail)}" alt="${escapeHTML(playlist.title)} thumbnail">
                    <span><i class="fas fa-play"></i></span>
                </a>
                <div class="lecture-body">
                    <span>${escapeHTML(playlist.categoryLabel)}</span>
                    <h2>${escapeHTML(playlist.title)}</h2>
                    <p>${escapeHTML(playlist.notes || "Saved personal playlist.")}</p>
                    <div class="playlist-card-actions">
                        <a href="${escapeHTML(playlist.url)}" target="_blank" rel="noopener">
                            Open Playlist <i class="fas fa-arrow-up-right-from-square"></i>
                        </a>
                        <button type="button" title="Delete playlist">
                            <i class="fas fa-trash" aria-hidden="true"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join("");
}

function addCustomPlaylist() {
    if (!state.userEmail) {
        openAuthModal();
        return;
    }

    const titleInput = document.getElementById("playlistTitleInput");
    const urlInput = document.getElementById("playlistUrlInput");
    const categoryInput = document.getElementById("playlistCategoryInput");
    const notesInput = document.getElementById("playlistNotesInput");
    const title = titleInput?.value.trim() || "";
    const url = urlInput?.value.trim() || "";

    if (!title || !url) {
        return;
    }

    const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    let playlistUrl = normalizedUrl;

    try {
        const parsedUrl = new URL(normalizedUrl);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return;
        }
        playlistUrl = parsedUrl.toString();
    } catch (error) {
        urlInput?.focus();
        return;
    }

    const category = categoryInput?.value || "custom";
    const categoryLabels = {
        programming: "Programming",
        web: "Web",
        dsa: "DSA",
        cs: "CS Core",
        custom: "Custom"
    };

    state.customPlaylists.unshift({
        id: window.crypto?.randomUUID?.() || `${Date.now()}`,
        title,
        url: playlistUrl,
        category,
        categoryLabel: categoryLabels[category] || "Custom",
        notes: notesInput?.value.trim() || "",
        thumbnail: getPlaylistThumbnail(playlistUrl),
        createdAt: new Date().toISOString()
    });

    titleInput.value = "";
    urlInput.value = "";
    if (notesInput) {
        notesInput.value = "";
    }

    saveCustomPlaylists();
    renderCustomPlaylists();
}

function initCustomPlaylists() {
    const form = document.getElementById("playlistForm");
    const grid = document.getElementById("customPlaylistGrid");

    if (!form || !grid) {
        return;
    }

    renderCustomPlaylists();

    form.addEventListener("submit", event => {
        event.preventDefault();
        addCustomPlaylist();
    });

    grid.addEventListener("click", event => {
        const button = event.target.closest("button");
        const card = event.target.closest("[data-playlist-id]");

        if (!button || !card) {
            return;
        }

        state.customPlaylists = state.customPlaylists.filter(playlist => playlist.id !== card.dataset.playlistId);
        saveCustomPlaylists();
        renderCustomPlaylists();
    });
}

function getLiveTypingChunkSize(pendingLength) {
    if (pendingLength > 220) {
        return 32;
    }

    if (pendingLength > 80) {
        return 18;
    }

    return 8;
}

function getLiveTypingDelay(pendingLength) {
    if (pendingLength > 220) {
        return 2;
    }

    if (pendingLength > 80) {
        return 4;
    }

    return 7;
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

        setResultState("success", renderNotesShell(formData, '<p class="stream-warmup">Preparing your notes...</p>', "writing-content"));
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

    showNotesShell();
    const streamedText = await streamNotes(formData, addStreamChunk);

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

function initStudyTools() {
    const pdfInput = document.getElementById("pdfInput");
    const pdfFileName = document.getElementById("pdfFileName");
    const pdfButton = document.getElementById("summarizePdfButton");
    const youtubeButton = document.getElementById("summarizeYoutubeButton");
    const pomodoroStartButton = document.getElementById("pomodoroStartButton");
    const pomodoroResetButton = document.getElementById("pomodoroResetButton");
    const addTaskButton = document.getElementById("addTaskButton");
    const taskInput = document.getElementById("studyTaskInput");
    const goalInput = document.getElementById("studyGoalInput");
    const taskList = document.getElementById("taskList");
    const focusButton = document.getElementById("focusMusicButton");
    const focusVolumeInput = document.getElementById("focusVolumeInput");
    const focusSoundSelect = document.getElementById("focusSoundSelect");

    pdfInput?.addEventListener("change", () => {
        const file = pdfInput.files?.[0];
        if (pdfFileName) {
            pdfFileName.textContent = file?.name || "Choose a PDF file";
        }
    });

    pdfButton?.addEventListener("click", summarizePdf);
    youtubeButton?.addEventListener("click", summarizeYoutubeLecture);

    document.querySelectorAll("[data-pomodoro-mode]").forEach(button => {
        button.addEventListener("click", () => {
            setPomodoroMode(button.dataset.pomodoroMode || "focus");
        });
    });

    pomodoroStartButton?.addEventListener("click", togglePomodoro);
    pomodoroResetButton?.addEventListener("click", () => {
        setPomodoroMode(state.pomodoroMode);
    });
    updatePomodoroDisplay();

    loadStudyTasks();
    renderStudyTasks();

    goalInput?.addEventListener("input", () => {
        window.localStorage.setItem(GOAL_STORAGE_KEY, goalInput.value.trim());
    });

    addTaskButton?.addEventListener("click", addStudyTask);
    taskInput?.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            event.preventDefault();
            addStudyTask();
        }
    });

    taskList?.addEventListener("change", event => {
        const item = event.target.closest("li[data-task-id]");
        const task = state.tasks.find(entry => entry.id === item?.dataset.taskId);

        if (task && event.target.matches("input[type='checkbox']")) {
            task.done = event.target.checked;
            saveStudyTasks();
            renderStudyTasks();
        }
    });

    taskList?.addEventListener("click", event => {
        const button = event.target.closest("button");
        const item = event.target.closest("li[data-task-id]");

        if (!button || !item) {
            return;
        }

        state.tasks = state.tasks.filter(task => task.id !== item.dataset.taskId);
        saveStudyTasks();
        renderStudyTasks();
    });

    focusButton?.addEventListener("click", () => {
        if (state.focusAudio) {
            stopFocusMusic();
        } else {
            startFocusMusic();
        }
    });
    focusVolumeInput?.addEventListener("input", updateFocusVolume);
    focusSoundSelect?.addEventListener("change", () => {
        if (state.focusAudio) {
            startFocusMusic();
        }
    });
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
    const cards = Array.from(document.querySelectorAll("#curatedLectureGrid .lecture-card"));
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
    initAuth();
    initHomeGenerator();
    initStudyTools();
    initLectureFilters();
    initCustomPlaylists();
});
