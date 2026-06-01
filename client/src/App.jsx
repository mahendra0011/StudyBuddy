import {
  AlertCircle,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  FileText,
  Headphones,
  Home,
  ListChecks,
  LockKeyhole,
  Loader2,
  LogOut,
  Mail,
  Maximize2,
  Minimize2,
  Music2,
  Pause,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  User,
  UserPlus,
  Volume1,
  Volume2,
  WandSparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, streamGenerateNotes } from "./services/api";
import { categories, curatedLectures, views } from "./data/studyData";
import { markdownToHTML } from "./utils/markdown";

const AUTH_STORAGE_KEY = "studybuddy-auth";
const TASK_STORAGE_KEY = "studybuddy-study-tasks";
const GOAL_STORAGE_KEY = "studybuddy-study-goal";
const LEGACY_AUTH_STORAGE_KEY = "notesgpt-auth";
const LEGACY_TASK_STORAGE_KEY = "notesgpt-study-tasks-react";
const LEGACY_GOAL_STORAGE_KEY = "notesgpt-study-goal-react";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCRIPT_SRC = "https://accounts.google.com/gsi/client";
const POMODORO_DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};
const TYPING_INTERVAL_MS = 16;
const TYPING_MIN_CHARS = 8;
const TYPING_MAX_CHARS = 36;

const VIEW_META = {
  home: {
    icon: Home,
    tone: "blue",
    metric: "AI prompt studio",
    detail: "Generate structured study notes"
  },
  pdf: {
    icon: UploadCloud,
    tone: "blue",
    metric: "PDF to notes",
    detail: "Upload handouts and chapters"
  },
  video: {
    icon: Play,
    tone: "rose",
    metric: "Lecture summary",
    detail: "YouTube metadata and transcripts"
  },
  library: {
    icon: Bookmark,
    tone: "teal",
    metric: "Saved account library",
    detail: "Notes, summaries, and study tasks"
  },
  pomodoro: {
    icon: Clock3,
    tone: "amber",
    metric: "Focus sprint",
    detail: "Timed study and breaks"
  },
  tasks: {
    icon: Target,
    tone: "teal",
    metric: "Study planner",
    detail: "Goals, tasks, and progress"
  },
  music: {
    icon: Volume2,
    tone: "indigo",
    metric: "Ambient focus",
    detail: "Low-volume study sound"
  }
};

const TONE_CLASSES = {
  blue: {
    shell: "from-white via-blue-50/70 to-cyan-50/80",
    icon: "bg-blue-600 text-white shadow-blue-100",
    soft: "border-blue-200 bg-blue-50 text-blue-700",
    rail: "bg-blue-600"
  },
  rose: {
    shell: "from-white via-rose-50/75 to-orange-50/70",
    icon: "bg-rose-600 text-white shadow-rose-100",
    soft: "border-rose-200 bg-rose-50 text-rose-700",
    rail: "bg-rose-600"
  },
  amber: {
    shell: "from-white via-amber-50/80 to-lime-50/70",
    icon: "bg-amber-500 text-white shadow-amber-100",
    soft: "border-amber-200 bg-amber-50 text-amber-800",
    rail: "bg-amber-500"
  },
  teal: {
    shell: "from-white via-teal-50/75 to-emerald-50/70",
    icon: "bg-teal-600 text-white shadow-teal-100",
    soft: "border-teal-200 bg-teal-50 text-teal-800",
    rail: "bg-teal-600"
  },
  indigo: {
    shell: "from-white via-indigo-50/75 to-sky-50/70",
    icon: "bg-indigo-600 text-white shadow-indigo-100",
    soft: "border-indigo-200 bg-indigo-50 text-indigo-700",
    rail: "bg-indigo-600"
  }
};

let googleIdentityScriptPromise = null;

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function loadGoogleIdentityScript() {
  if (window.google?.accounts?.id) {
    return Promise.resolve();
  }

  if (!googleIdentityScriptPromise) {
    googleIdentityScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${GOOGLE_SCRIPT_SRC}"]`);

      if (existingScript) {
        existingScript.addEventListener("load", resolve, { once: true });
        existingScript.addEventListener("error", reject, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = GOOGLE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  return googleIdentityScriptPromise;
}

function friendlyError(error) {
  const message = error?.message || "Something went wrong.";
  const lower = message.toLowerCase();

  if (
    lower.includes("429")
    || lower.includes("quota")
    || lower.includes("rate limit")
    || lower.includes("resource_exhausted")
    || lower.includes("too many requests")
  ) {
    return "Gemini quota or rate limit is reached for this API key. Wait a few minutes, use a key with available quota, or enable billing in Google AI Studio.";
  }

  if (lower.includes("database") || lower.includes("mongodb")) {
    return "MongoDB is not connected. Add MONGODB_URI in your server environment variables.";
  }

  if (lower.includes("api key") || lower.includes("gemini")) {
    return message;
  }

  return message;
}

function parseStoredAuth() {
  try {
    const currentAuth = localStorage.getItem(AUTH_STORAGE_KEY);
    const legacyAuth = localStorage.getItem(LEGACY_AUTH_STORAGE_KEY);

    if (!currentAuth && legacyAuth) {
      localStorage.setItem(AUTH_STORAGE_KEY, legacyAuth);
      localStorage.removeItem(LEGACY_AUTH_STORAGE_KEY);
    }

    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function getStoredStudyGoal() {
  const currentGoal = localStorage.getItem(GOAL_STORAGE_KEY);
  const legacyGoal = localStorage.getItem(LEGACY_GOAL_STORAGE_KEY);

  if (!currentGoal && legacyGoal) {
    localStorage.setItem(GOAL_STORAGE_KEY, legacyGoal);
    localStorage.removeItem(LEGACY_GOAL_STORAGE_KEY);
    return legacyGoal;
  }

  return currentGoal || "";
}

function getStoredStudyTasks() {
  try {
    const currentTasks = localStorage.getItem(TASK_STORAGE_KEY);
    const legacyTasks = localStorage.getItem(LEGACY_TASK_STORAGE_KEY);

    if (!currentTasks && legacyTasks) {
      localStorage.setItem(TASK_STORAGE_KEY, legacyTasks);
      localStorage.removeItem(LEGACY_TASK_STORAGE_KEY);
      return JSON.parse(legacyTasks || "[]");
    }

    return JSON.parse(currentTasks || "[]");
  } catch (error) {
    return [];
  }
}

function clearStoredStudyDrafts() {
  localStorage.removeItem(GOAL_STORAGE_KEY);
  localStorage.removeItem(TASK_STORAGE_KEY);
  localStorage.removeItem(LEGACY_GOAL_STORAGE_KEY);
  localStorage.removeItem(LEGACY_TASK_STORAGE_KEY);
}

function getStudyItemType(view) {
  if (view === "pdf") {
    return "pdf";
  }

  if (view === "video") {
    return "youtube";
  }

  return "note";
}

function createTitleFromPrompt(prompt) {
  return String(prompt || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 72);
}

function getGeneratedTitle(payload, view) {
  const explicitTitle = String(payload?.title || "").trim();

  if (explicitTitle) {
    return explicitTitle.slice(0, 160);
  }

  if (view === "pdf") {
    return payload?.sourceName ? `PDF: ${payload.sourceName}` : "PDF summary";
  }

  if (view === "video") {
    return payload?.metadata?.videoTitle || "YouTube lecture summary";
  }

  return createTitleFromPrompt(payload?.prompt) || `${payload?.category || "General"} notes`;
}

function createSavedStudyPayload(payload, view, text) {
  const type = getStudyItemType(view);
  const metadata = {
    ...(payload?.metadata || {}),
    language: payload?.language || "English",
    depth: payload?.depth || "exam revision"
  };

  return {
    type,
    title: getGeneratedTitle(payload, view),
    content: text,
    prompt: payload?.prompt || "",
    category: payload?.category || "General",
    sourceUrl: payload?.sourceUrl || "",
    metadata
  };
}

function getPreviewText(value, maxLength = 180) {
  const preview = String(value || "")
    .replace(/[#*_`>[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return preview.length > maxLength ? `${preview.slice(0, maxLength).trim()}...` : preview;
}

function formatSavedDate(value) {
  if (!value) {
    return "";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function Layout({ page, activeView, user, onNavigateHome, onNavigateLectures, onOpenAuth, children }) {
  return (
    <div className="app-shell mx-auto min-h-screen w-[min(1200px,calc(100%-28px))] py-4 sm:py-5">
      <header className="sticky top-3 z-30 grid gap-3 rounded-xl border border-white/80 bg-white/[0.88] p-2 shadow-soft backdrop-blur-xl lg:grid-cols-[auto_1fr_auto] lg:items-center">
        <button onClick={() => onNavigateHome("home")} className="inline-flex min-w-max items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-slate-50">
          <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-blue-600 via-indigo-600 to-teal-500 text-white shadow-lg shadow-blue-100">
            <WandSparkles size={20} />
          </span>
          <span>
            <strong className="block text-base leading-tight text-ink">StudyBuddy</strong>
            <small className="block text-xs font-semibold text-muted">AI study workspace</small>
          </span>
        </button>

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-slate-50/90 p-1" aria-label="Primary">
          {views.map(view => (
            <NavButton
              key={view.id}
              active={page === "home" && activeView === view.id}
              icon={VIEW_META[view.id]?.icon || Sparkles}
              label={view.label}
              onClick={() => onNavigateHome(view.id)}
            />
          ))}
          <NavButton active={page === "lectures"} icon={BookOpen} label="Lectures" onClick={onNavigateLectures} />
        </nav>

        <button type="button" onClick={onOpenAuth} className="ghost-btn justify-self-start overflow-hidden lg:justify-self-end">
          <User size={17} />
          <span className="truncate">{user ? user.name : "Sign in"}</span>
        </button>
      </header>

      <main className="pb-10">{children}</main>
    </div>
  );
}

function NavButton({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        "inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-extrabold text-muted transition",
        active && "bg-white text-ink shadow-tight ring-1 ring-white",
        !active && "hover:bg-white hover:text-ink"
      )}
    >
      <Icon size={16} />
      {label}
    </button>
  );
}

function GoogleSignInButton({ disabled, onCredential }) {
  const buttonRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [scriptError, setScriptError] = useState("");

  useEffect(() => {
    callbackRef.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let cancelled = false;

    if (!GOOGLE_CLIENT_ID || !buttonRef.current) {
      return undefined;
    }

    setScriptError("");

    loadGoogleIdentityScript()
      .then(() => {
        if (cancelled || !buttonRef.current) {
          return;
        }

        buttonRef.current.innerHTML = "";
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: response => {
            if (response?.credential) {
              callbackRef.current(response.credential);
            }
          }
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          type: "standard",
          shape: "rectangular",
          text: "continue_with",
          logo_alignment: "left",
          width: Math.min(400, Math.max(280, buttonRef.current.offsetWidth || 360))
        });
      })
      .catch(() => {
        if (!cancelled) {
          setScriptError("Google sign-in could not load.");
        }
      });

    return () => {
      cancelled = true;
      if (buttonRef.current) {
        buttonRef.current.innerHTML = "";
      }
    };
  }, []);

  return (
    <>
      <div
        ref={buttonRef}
        className={classNames(
          "flex min-h-11 w-full items-center justify-center overflow-hidden rounded-lg bg-white",
          disabled && "pointer-events-none opacity-60"
        )}
      />
      {scriptError && <p className="mt-2 text-sm font-semibold text-rose-600">{scriptError}</p>}
    </>
  );
}

function AuthModal({ open, user, onClose, onAuth, onLogout }) {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({ name: "", email: "", password: "" });
      setGoogleLoading(false);
    }
  }, [open, mode]);

  if (!open) {
    return null;
  }

  async function submitAuth(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload = mode === "signup"
        ? form
        : { email: form.email, password: form.password };
      const data = await apiRequest(`/api/auth/${mode}`, {
        method: "POST",
        body: payload
      });
      onAuth(data);
      onClose();
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setLoading(false);
    }
  }

  async function submitGoogleAuth(credential) {
    setError("");
    setGoogleLoading(true);

    try {
      const data = await apiRequest("/api/auth/google", {
        method: "POST",
        body: { credential }
      });
      onAuth(data);
      onClose();
    } catch (submitError) {
      setError(friendlyError(submitError));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-md">
      <section
        className={classNames(
          "relative grid overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]",
          user ? "w-[min(430px,100%)]" : "w-[min(920px,100%)] md:grid-cols-[0.95fr_1.05fr]"
        )}
      >
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 icon-btn bg-white/95" title="Close">
          <X size={18} />
        </button>

        {!user && (
          <aside className="relative hidden min-h-[540px] overflow-hidden bg-slate-950 p-7 text-white md:flex md:flex-col md:justify-between">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(45,212,191,0.28),transparent_30%),radial-gradient(circle_at_82%_12%,rgba(96,165,250,0.26),transparent_26%),linear-gradient(135deg,#020617,#0f172a_48%,#0f766e)]" />
            <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-300 via-sky-300 to-amber-200" />

            <div className="relative">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.12] ring-1 ring-white/20">
                <WandSparkles size={24} />
              </span>
              <h2 className="mt-6 max-w-xs text-4xl font-black leading-tight">
                StudyBuddy
              </h2>
              <p className="mt-3 max-w-sm text-sm font-semibold leading-7 text-slate-100/85">
                Sign in and get back to studying.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-xl border border-white/[0.14] bg-white/[0.10] p-4 shadow-2xl shadow-slate-950/25 backdrop-blur">
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-lg bg-white text-blue-700">
                    <ShieldCheck size={21} />
                  </span>
                  <div>
                    <strong className="block text-sm">Clean account access</strong>
                    <span className="mt-1 block text-xs text-slate-100/70">Fast, simple, and synced.</span>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        )}

        <div className={classNames(user ? "p-5 sm:p-6" : "p-5 sm:p-8")}>
          {user && (
            <span className="mb-4 grid h-12 w-12 place-items-center rounded-lg bg-teal-600 text-white shadow-lg shadow-teal-100">
              <CheckCircle2 size={22} />
            </span>
          )}
          <span className="eyebrow"><User size={14} /> StudyBuddy account</span>
          <h2 className={classNames("mt-3 font-black leading-tight text-ink", user ? "text-2xl" : "text-3xl")}>
            {user ? "Signed in" : mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className={classNames("mt-2 leading-7 text-muted", user ? "text-sm" : "max-w-md")}>
            {user
              ? "Your account is active."
              : mode === "login"
                ? "Continue with Google or use your email and password."
                : "Start with Google or create a StudyBuddy password account."}
          </p>

          {user && (
            <div className="mt-5 rounded-lg border border-line bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-teal-700 ring-1 ring-teal-100">
                  <User size={19} />
                </span>
                <div>
                  <strong className="block truncate text-ink">{user.name}</strong>
                  <span className="block truncate text-sm text-muted">{user.email}</span>
                </div>
              </div>
              <button type="button" onClick={onLogout} className="mt-4 ghost-btn w-full">
                <LogOut size={18} />
                Sign out
              </button>
            </div>
          )}

          {!user && (
            <>
              <div className="mt-6">
                {GOOGLE_CLIENT_ID ? (
                  <div className="relative rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-tight">
                    <GoogleSignInButton disabled={loading || googleLoading} onCredential={submitGoogleAuth} />
                    {googleLoading && (
                      <span className="absolute inset-0 grid place-items-center rounded-lg bg-white/70">
                        <Loader2 className="animate-spin text-blue-700" size={20} />
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                    Google sign-in is not configured.
                  </p>
                )}
              </div>

              <div className="my-5 flex items-center gap-3 text-xs font-extrabold uppercase text-muted">
                <span className="h-px flex-1 bg-line" />
                <span>or use email</span>
                <span className="h-px flex-1 bg-line" />
              </div>

              <div className="mb-4 grid grid-cols-2 gap-1 rounded-lg border border-line bg-slate-50 p-1">
                {["signup", "login"].map(item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setMode(item)}
                    className={classNames(
                      "min-h-11 rounded-md font-bold text-muted transition",
                      mode === item && "bg-white text-blue-700 shadow-tight"
                    )}
                  >
                    {item === "signup" ? "Create account" : "Log in"}
                  </button>
                ))}
              </div>

              <form onSubmit={submitAuth} className="grid gap-3">
                {mode === "signup" && (
                  <label className="relative block">
                    <UserPlus className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      className="field pl-10"
                      placeholder="Full name"
                      value={form.name}
                      onChange={event => setForm({ ...form, name: event.target.value })}
                      required
                    />
                  </label>
                )}
                <label className="relative block">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    className="field pl-10"
                    type="email"
                    placeholder="you@example.com"
                    value={form.email}
                    onChange={event => setForm({ ...form, email: event.target.value })}
                    required
                  />
                </label>
                <label className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    className="field pl-10"
                    type="password"
                    placeholder="Password"
                    value={form.password}
                    onChange={event => setForm({ ...form, password: event.target.value })}
                    minLength={6}
                    required
                  />
                </label>
                {error && (
                  <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
                    {error}
                  </p>
                )}
                <button className="primary-btn min-h-12" disabled={loading || googleLoading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : mode === "signup" ? <UserPlus size={18} /> : <ArrowRight size={18} />}
                  {mode === "signup" ? "Create account" : "Log in"}
                </button>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function cleanPdfText(value) {
  return String(value || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function addPdfWrappedText(doc, text, options) {
  const { x, y, maxWidth, lineHeight, pageHeight, bottomMargin, indent = 0 } = options;
  let nextY = y;
  const lines = doc.splitTextToSize(text, maxWidth - indent);

  lines.forEach(line => {
    if (nextY > pageHeight - bottomMargin) {
      doc.addPage();
      nextY = 24;
    }

    doc.text(line, x + indent, nextY);
    nextY += lineHeight;
  });

  return nextY;
}

async function downloadNotesPdf(result) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 42;
  const maxWidth = pageWidth - margin * 2;
  let y = 48;

  doc.setProperties({
    title: "StudyBuddy Generated Notes",
    subject: "Generated study notes",
    creator: "StudyBuddy"
  });

  doc.setTextColor(15, 23, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("StudyBuddy Generated Notes", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Created ${new Date().toLocaleDateString()} from ${result.view || "study"} notes`, margin, y);
  y += 26;

  String(result.text || "").replace(/\r\n/g, "\n").split("\n").forEach(rawLine => {
    const line = rawLine.trim();

    if (!line) {
      y += 8;
      return;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    const ordered = line.match(/^(\d+)\.\s+(.+)$/);
    const unordered = line.match(/^[-*]\s+(.+)$/);

    if (heading) {
      const level = heading[1].length;
      const fontSize = level === 1 ? 16 : level === 2 ? 13 : 11;
      y += level === 1 ? 8 : 5;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fontSize);
      doc.setTextColor(15, 23, 42);
      y = addPdfWrappedText(doc, cleanPdfText(heading[2]), {
        x: margin,
        y,
        maxWidth,
        lineHeight: fontSize + 5,
        pageHeight,
        bottomMargin: margin
      });
      y += 5;
      return;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);

    if (ordered) {
      y = addPdfWrappedText(doc, `${ordered[1]}. ${cleanPdfText(ordered[2])}`, {
        x: margin,
        y,
        maxWidth,
        lineHeight: 15,
        pageHeight,
        bottomMargin: margin,
        indent: 10
      });
      y += 3;
      return;
    }

    if (unordered) {
      y = addPdfWrappedText(doc, `- ${cleanPdfText(unordered[1])}`, {
        x: margin,
        y,
        maxWidth,
        lineHeight: 15,
        pageHeight,
        bottomMargin: margin,
        indent: 10
      });
      y += 3;
      return;
    }

    y = addPdfWrappedText(doc, cleanPdfText(line), {
      x: margin,
      y,
      maxWidth,
      lineHeight: 15,
      pageHeight,
      bottomMargin: margin
    });
    y += 5;
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    doc.setPage(pageNumber);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Page ${pageNumber} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: "right" });
  }

  const fileDate = new Date().toISOString().slice(0, 10);
  doc.save(`studybuddy-${result.view || "generated"}-notes-${fileDate}.pdf`);
}

function NotesResult({ result, activeView, token, onOpenAuth, onSaveResult }) {
  const visible = result.status === "idle" ? activeView === "home" : result.view === activeView;

  if (!visible) {
    return null;
  }

  return (
    <section className="section-panel mt-5 min-h-80 bg-white/95" aria-live="polite">
      {result.status === "idle" && (
        <div className="grid min-h-72 place-items-center text-center">
          <div className="max-w-lg">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700">
              <FileText size={30} />
            </span>
            <h3 className="mt-3 text-lg font-extrabold">Your generated notes will appear here.</h3>
            <p className="mt-2 text-muted">Choose a tool or write a prompt.</p>
            <div className="mt-6 grid gap-2 text-left">
              {["Overview", "Key points", "Exam tips"].map(item => (
                <div key={item} className="flex items-center gap-3 rounded-lg border border-line bg-slate-50 px-3 py-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-bold text-muted">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {result.status === "loading" && (
        <div className="overflow-hidden rounded-lg border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-teal-50 shadow-soft">
          <div className="flex flex-wrap items-center gap-4 border-b border-blue-100 bg-white/80 px-5 py-4">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br from-blue-600 to-teal-500 text-white">
              <WandSparkles size={20} />
            </span>
            <div>
              <strong className="block">StudyBuddy is writing</strong>
              <p className="text-sm text-muted">Structuring the answer in real time</p>
            </div>
            <div className="ml-auto flex gap-1">
              <span className="thinking-dot h-2 w-2 rounded-full bg-brand"></span>
              <span className="thinking-dot h-2 w-2 rounded-full bg-brand"></span>
              <span className="thinking-dot h-2 w-2 rounded-full bg-brand"></span>
            </div>
          </div>
          {result.html ? (
            <div className="notes-output generation-output typing-output" dangerouslySetInnerHTML={{ __html: result.html }} />
          ) : (
            <div className="grid gap-3 p-5">
              <span className="h-4 w-3/5 rounded-full bg-blue-100" />
              <span className="h-4 w-11/12 rounded-full bg-slate-100" />
              <span className="h-4 w-10/12 rounded-full bg-slate-100" />
              <span className="h-4 w-7/12 rounded-full bg-slate-100" />
            </div>
          )}
        </div>
      )}

      {result.status === "error" && (
        <div className="grid min-h-72 place-items-center">
          <div className="max-w-xl rounded-lg border border-rose-100 bg-gradient-to-br from-white via-rose-50 to-orange-50 p-6 text-center shadow-soft">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-rose-600 text-white shadow-lg shadow-rose-100">
              <AlertCircle size={22} />
            </span>
            <h3 className="mt-4 text-lg font-extrabold text-ink">Generation paused</h3>
            <p className="mt-2 text-sm leading-6 text-muted">{result.error}</p>
            <div className="mt-5 inline-flex rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-extrabold uppercase tracking-[0.16em] text-rose-600">
              Check Gemini quota
            </div>
          </div>
        </div>
      )}

      {result.status === "done" && (
        <div className="overflow-hidden rounded-lg border border-line bg-white shadow-tight">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/80 px-5 py-4">
            <div>
              <span className="eyebrow"><CheckCircle2 size={15} /> Generated notes</span>
              <h3 className="mt-1 text-lg font-extrabold text-ink">Ready to revise</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {result.saveMessage && (
                <span
                  className={classNames(
                    "rounded-lg border px-3 py-2 text-xs font-extrabold uppercase",
                    result.saveStatus === "saved" && "border-teal-200 bg-teal-50 text-teal-700",
                    result.saveStatus === "saving" && "border-blue-200 bg-blue-50 text-blue-700",
                    result.saveStatus === "error" && "border-rose-200 bg-rose-50 text-rose-700",
                    result.saveStatus === "needs-auth" && "border-amber-200 bg-amber-50 text-amber-800"
                  )}
                >
                  {result.saveMessage}
                </span>
              )}
              {["needs-auth", "error"].includes(result.saveStatus) && (
                <button type="button" className="ghost-btn" onClick={token ? onSaveResult : onOpenAuth}>
                  <User size={17} />
                  {token ? "Save now" : "Sign in"}
                </button>
              )}
              <button type="button" className="ghost-btn" onClick={() => downloadNotesPdf(result)}>
                <Download size={18} />
                Download PDF
              </button>
            </div>
          </div>
          <div className="notes-output generation-output" dangerouslySetInnerHTML={{ __html: result.html }} />
        </div>
      )}
    </section>
  );
}

function HomePanel({ onGenerate }) {
  const [form, setForm] = useState({
    prompt: "",
    category: "General",
    language: "English",
    depth: "exam revision"
  });

  function submit(event) {
    event.preventDefault();
    onGenerate({
      ...form,
      title: createTitleFromPrompt(form.prompt) || `${form.category} notes`
    }, "home");
  }

  function useCategory(item) {
    const nextForm = { ...form, prompt: item.prompt, category: item.category, title: item.title };
    setForm(nextForm);
    onGenerate(nextForm, "home");
  }

  return (
    <>
      <section className="relative py-6 sm:py-9">
        <div className="home-ambient" aria-hidden="true" />
        <div className="hero-panel relative overflow-hidden rounded-xl border border-white/80 bg-white/[0.9] p-5 shadow-soft backdrop-blur sm:p-7">
          <div className="mx-auto max-w-5xl">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-600 via-teal-500 to-amber-400" />
            <span className="eyebrow"><Sparkles size={15} /> Gemini powered study notes</span>
            <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
              Generate clean notes from one prompt.
            </h1>
            <p className="mt-4 max-w-2xl text-lg leading-8 text-muted">
              Turn topics, PDFs, and lectures into clear revision notes with headings, examples, and exam-ready points.
            </p>

            <form onSubmit={submit} className="mt-6 overflow-hidden rounded-lg border border-line bg-white shadow-tight">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/80 px-4 py-3">
                <span className="inline-flex items-center gap-2 text-sm font-extrabold text-blue-700">
                  <WandSparkles size={17} />
                  AI prompt
                </span>
                <span className="inline-flex items-center gap-2 rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700">
                  <Radio size={13} />
                  Live writing
                </span>
              </div>
              <textarea
                className="textarea-field min-h-36 rounded-none border-0 bg-white text-base focus:ring-0"
                rows={4}
                placeholder="Ask anything: DBMS normalization, Java OOP, OS deadlocks..."
                value={form.prompt}
                onChange={event => setForm({ ...form, prompt: event.target.value })}
                required
              />
              <div className="grid gap-3 border-t border-line bg-slate-50/70 p-3 lg:grid-cols-[1fr_auto] lg:items-end">
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Category
                    <select className="field bg-white" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
                      {["General", "DBMS", "Operating System", "Data Structures", "Artificial Intelligence", "Java", "Web Development"].map(item => (
                        <option key={item}>{item}</option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Language
                    <select className="field bg-white" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>
                      <option>English</option>
                      <option>Hindi</option>
                    </select>
                  </label>
                  <label className="grid gap-1 text-sm font-bold text-slate-700">
                    Depth
                    <select className="field bg-white" value={form.depth} onChange={event => setForm({ ...form, depth: event.target.value })}>
                      <option value="exam revision">Exam revision</option>
                      <option value="detailed classroom notes">Detailed notes</option>
                      <option value="quick short notes">Short notes</option>
                    </select>
                  </label>
                </div>
                <button className="primary-btn min-h-12">
                  <Sparkles size={18} />
                  Generate
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>

      <section className="section-panel bg-white/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow"><ListChecks size={15} /> Popular categories</span>
            <h2 className="mt-2 text-2xl font-extrabold">Start with a study category</h2>
          </div>
          <span className="rounded-full border border-line bg-slate-50 px-3 py-1 text-xs font-extrabold uppercase text-muted">
            Quick generate
          </span>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {categories.map((item, index) => {
            const Icon = item.icon;
            const accents = [
              { icon: "from-blue-600 to-cyan-500", text: "text-blue-700" },
              { icon: "from-teal-600 to-emerald-500", text: "text-teal-700" },
              { icon: "from-amber-500 to-orange-500", text: "text-amber-800" },
              { icon: "from-indigo-600 to-blue-500", text: "text-indigo-700" },
              { icon: "from-rose-600 to-orange-500", text: "text-rose-700" },
              { icon: "from-cyan-600 to-blue-500", text: "text-cyan-700" }
            ];
            const accent = accents[index % accents.length];
            return (
              <button key={item.title} type="button" onClick={() => useCategory(item)} className="group min-h-[148px] rounded-lg border border-line bg-white p-4 text-left shadow-tight transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-soft">
                <span className={classNames("grid h-11 w-11 place-items-center rounded-lg bg-gradient-to-br text-white shadow-lg", accent.icon)}>
                  <Icon size={22} />
                </span>
                <span className={classNames("mt-3 block text-xs font-extrabold uppercase", accent.text)}>{item.category}</span>
                <strong className="mt-1 block text-[1.02rem] text-ink">{item.title}</strong>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-muted transition group-hover:text-blue-700">
                  Generate notes <ChevronRight size={15} />
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function PdfPanel({ onGenerate }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function summarizePdf() {
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("pdf", file);
      const extracted = await apiRequest("/api/pdf-text", {
        method: "POST",
        body: formData
      });
      await onGenerate({
        title: `PDF: ${extracted.fileName}`,
        sourceName: extracted.fileName,
        prompt: [
          `Create clear study notes from this PDF: ${extracted.fileName}.`,
          `Pages read: ${extracted.pageLimit} of ${extracted.pageCount}.`,
          extracted.text.slice(0, 28000)
        ].join("\n\n"),
        category: "PDF Summary",
        language: "English",
        depth: "detailed classroom notes",
        metadata: {
          fileName: extracted.fileName,
          pageCount: extracted.pageCount,
          pageLimit: extracted.pageLimit
        }
      }, "pdf");
    } catch (pdfError) {
      setError(friendlyError(pdfError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolShell view="pdf" eyebrow="PDF summary" title="Summarize study PDFs" description="Upload notes, chapters, or handouts and turn them into structured revision points.">
      <label className="group grid min-h-44 cursor-pointer place-items-center rounded-lg border border-dashed border-blue-300 bg-gradient-to-br from-blue-50 to-white px-5 py-6 text-center transition hover:border-blue-500 hover:bg-blue-50">
        <input className="hidden" type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
        <span>
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-100 transition group-hover:-translate-y-0.5">
            <UploadCloud size={22} />
          </span>
          <strong className="mt-4 block text-ink">{file ? file.name : "Choose a PDF file"}</strong>
          <span className="mt-1 block text-sm text-muted">Upload class notes, chapters, or handouts</span>
        </span>
      </label>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      <button type="button" className="primary-btn" onClick={summarizePdf} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" size={18} /> : <Sparkles size={18} />}
        Summarize PDF
      </button>
    </ToolShell>
  );
}

function VideoPanel({ onGenerate }) {
  const [url, setUrl] = useState("");
  const [extraNotes, setExtraNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function summarizeVideo() {
    if (!url.trim()) {
      setError("Paste a YouTube lecture link.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const video = await apiRequest("/api/youtube", {
        method: "POST",
        body: { url }
      });
      await onGenerate({
        title: video.title || "YouTube lecture summary",
        sourceUrl: video.url || url,
        prompt: [
          "Create study notes from this YouTube lecture.",
          `Title: ${video.title || "Lecture"}`,
          `Channel: ${video.channelTitle || "Unknown"}`,
          `Duration: ${video.duration || "Unknown"}`,
          `Description: ${video.description || ""}`,
          extraNotes ? `Student transcript/timestamps: ${extraNotes}` : ""
        ].filter(Boolean).join("\n\n"),
        category: "YouTube Lecture",
        language: "English",
        depth: "detailed classroom notes",
        metadata: {
          videoId: video.videoId,
          videoTitle: video.title,
          channelTitle: video.channelTitle,
          duration: video.duration,
          thumbnail: video.thumbnail
        }
      }, "video");
    } catch (videoError) {
      setError(friendlyError(videoError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ToolShell view="video" eyebrow="Video summary" title="Summarize YouTube lectures" description="Paste a lecture link and optional transcript or timestamps to generate clean study notes.">
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Lecture URL
        <span className="relative block">
          <Play className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-rose-500" size={18} />
          <input className="field bg-white pl-10" type="url" placeholder="Paste YouTube lecture link" value={url} onChange={event => setUrl(event.target.value)} />
        </span>
      </label>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Transcript or timestamps
        <textarea className="textarea-field bg-white" rows={4} placeholder="Paste transcript or timestamps (optional)" value={extraNotes} onChange={event => setExtraNotes(event.target.value)} />
      </label>
      {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{error}</p>}
      <button type="button" className="primary-btn" onClick={summarizeVideo} disabled={loading}>
        {loading ? <Loader2 className="animate-spin" size={18} /> : <ListChecks size={18} />}
        Summarize Lecture
      </button>
    </ToolShell>
  );
}

function PomodoroPanel() {
  const [toolMode, setToolMode] = useState("pomodoro");
  const [mode, setMode] = useState("focus");
  const [remaining, setRemaining] = useState(POMODORO_DURATIONS.focus);
  const [customMinutes, setCustomMinutes] = useState(10);
  const [customSeconds, setCustomSeconds] = useState(0);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const alarmContextRef = useRef(null);
  const alarmPlayedRef = useRef(false);
  const customDuration = getCustomDuration(customMinutes, customSeconds);

  useEffect(() => () => {
    alarmContextRef.current?.close?.();
    alarmContextRef.current = null;
  }, []);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      if (toolMode === "stopwatch") {
        setStopwatchElapsed(value => value + 1);
        return;
      }

      setRemaining(value => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running, toolMode]);

  useEffect(() => {
    if (toolMode !== "stopwatch" && remaining === 0 && running) {
      setRunning(false);
      playCompletionAlarm();
    }
  }, [remaining, running, toolMode]);

  useEffect(() => {
    if (toolMode === "custom" && !running) {
      alarmPlayedRef.current = false;
      setRemaining(customDuration);
    }
  }, [customDuration, running, toolMode]);

  useEffect(() => {
    if (!isFullscreen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function closeFocusMode(event) {
      if (event.key === "Escape") {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", closeFocusMode);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeFocusMode);
    };
  }, [isFullscreen]);

  function getCustomDuration(minutesValue, secondsValue) {
    return Math.max(1, (Number(minutesValue) || 0) * 60 + (Number(secondsValue) || 0));
  }

  function clampNumber(value, min, max) {
    const numericValue = Number(value);

    if (Number.isNaN(numericValue)) {
      return min;
    }

    return Math.min(max, Math.max(min, Math.floor(numericValue)));
  }

  function formatTime(totalSeconds) {
    const safeSeconds = Math.max(0, totalSeconds);
    const hours = Math.floor(safeSeconds / 3600);
    const minutesValue = Math.floor((safeSeconds % 3600) / 60);
    const secondsValue = safeSeconds % 60;

    if (hours > 0) {
      return `${String(hours).padStart(2, "0")}:${String(minutesValue).padStart(2, "0")}:${String(secondsValue).padStart(2, "0")}`;
    }

    return `${String(minutesValue).padStart(2, "0")}:${String(secondsValue).padStart(2, "0")}`;
  }

  function getDurationLabel(totalSeconds) {
    if (totalSeconds >= 3600) {
      return formatTime(totalSeconds);
    }

    if (totalSeconds >= 60 && totalSeconds % 60 === 0) {
      return `${totalSeconds / 60} min`;
    }

    if (totalSeconds >= 60) {
      return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
    }

    return `${totalSeconds} sec`;
  }

  function getCountdownDuration() {
    return toolMode === "custom" ? customDuration : POMODORO_DURATIONS[mode];
  }

  function selectToolMode(nextToolMode) {
    setToolMode(nextToolMode);
    setRunning(false);
    alarmPlayedRef.current = false;

    if (nextToolMode === "stopwatch") {
      setStopwatchElapsed(0);
      return;
    }

    setRemaining(nextToolMode === "custom" ? customDuration : POMODORO_DURATIONS[mode]);
  }

  function changeMode(nextMode) {
    setToolMode("pomodoro");
    setMode(nextMode);
    setRunning(false);
    alarmPlayedRef.current = false;
    setRemaining(POMODORO_DURATIONS[nextMode]);
  }

  function updateCustomMinutes(value) {
    const nextMinutes = clampNumber(value, 0, 180);
    setCustomMinutes(nextMinutes);
    setRunning(false);
    alarmPlayedRef.current = false;
    setRemaining(getCustomDuration(nextMinutes, customSeconds));
  }

  function updateCustomSeconds(value) {
    const nextSeconds = clampNumber(value, 0, 59);
    setCustomSeconds(nextSeconds);
    setRunning(false);
    alarmPlayedRef.current = false;
    setRemaining(getCustomDuration(customMinutes, nextSeconds));
  }

  function resetActiveTool() {
    setRunning(false);
    alarmPlayedRef.current = false;

    if (toolMode === "stopwatch") {
      setStopwatchElapsed(0);
      return;
    }

    setRemaining(getCountdownDuration());
  }

  function toggleTimer() {
    if (!running && toolMode !== "stopwatch") {
      primeAlarmAudio();
    }

    if (!running && toolMode !== "stopwatch" && remaining === 0) {
      alarmPlayedRef.current = false;
      setRemaining(getCountdownDuration());
    }

    setRunning(value => !value);
  }

  function getAlarmContext() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return null;
    }

    if (!alarmContextRef.current || alarmContextRef.current.state === "closed") {
      alarmContextRef.current = new AudioContext();
    }

    return alarmContextRef.current;
  }

  function primeAlarmAudio() {
    const context = getAlarmContext();
    context?.resume?.();
  }

  function playCompletionAlarm() {
    if (alarmPlayedRef.current) {
      return;
    }

    alarmPlayedRef.current = true;
    const context = getAlarmContext();

    if (!context) {
      return;
    }

    context.resume?.();

    const startTime = context.currentTime + 0.03;
    const notes = [880, 1174.66, 1318.51, 1174.66];
    const masterGain = context.createGain();
    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.22, startTime + 0.03);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.15);
    masterGain.connect(context.destination);

    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startTime + index * 0.18;
      const noteEnd = noteStart + 0.14;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.8, noteStart + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain).connect(masterGain);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.03);
    });

    window.setTimeout(() => {
      try {
        masterGain.disconnect();
      } catch (error) {
        // The context may already be closed if the user navigates away.
      }
    }, 1400);
  }

  const modeLabels = {
    focus: "Deep focus",
    short: "Short break",
    long: "Long break"
  };
  const modeItems = ["focus", "short", "long"];
  const toolItems = [
    { id: "pomodoro", label: "Pomodoro" },
    { id: "custom", label: "Custom timer" },
    { id: "stopwatch", label: "Stopwatch" }
  ];
  const countdownDuration = getCountdownDuration();
  const displaySeconds = toolMode === "stopwatch" ? stopwatchElapsed : remaining;
  const displayTime = formatTime(displaySeconds);
  const progress = toolMode === "stopwatch" ? ((stopwatchElapsed % 60) / 60) * 100 : (remaining / countdownDuration) * 100;
  const boundedProgress = Math.min(100, Math.max(0, progress));
  const hasStarted = toolMode === "stopwatch" ? stopwatchElapsed > 0 : remaining < countdownDuration;
  const statusLabel = running ? "Running" : hasStarted ? "Paused" : "Ready";
  const activeTitle = toolMode === "stopwatch" ? "Stopwatch" : toolMode === "custom" ? "Custom timer" : modeLabels[mode];
  const headerTitle = toolMode === "stopwatch" ? "Stopwatch" : "Focus timer";
  const ringColor = toolMode === "stopwatch" ? "#14b8a6" : toolMode === "custom" ? "#2563eb" : "#f59e0b";
  const ringTrack = toolMode === "stopwatch" ? "#ccfbf1" : toolMode === "custom" ? "#dbeafe" : "#fff7ed";
  const accentTextClass = toolMode === "stopwatch" ? "text-teal-700" : toolMode === "custom" ? "text-blue-700" : "text-amber-700";
  const activeToolClass = toolMode === "stopwatch" ? "border-teal-300 bg-teal-50 text-teal-800" : toolMode === "custom" ? "border-blue-300 bg-blue-50 text-blue-800" : "border-amber-300 bg-amber-50 text-amber-800";
  const progressText = toolMode === "stopwatch" ? `${formatTime(stopwatchElapsed)} elapsed` : `${Math.round(boundedProgress)}% left`;
  const durationText = toolMode === "stopwatch" ? "Count up" : getDurationLabel(countdownDuration);

  function getModeLabel(item) {
    return item === "short" ? "Break" : item === "long" ? "Long" : "Focus";
  }

  function renderToolButtons(extraClassName = "") {
    return (
      <div className={classNames("grid grid-cols-3 gap-2", extraClassName)}>
        {toolItems.map(item => (
          <button key={item.id} type="button" onClick={() => selectToolMode(item.id)} className={classNames("min-h-11 rounded-lg border border-line bg-white px-2 text-sm font-extrabold transition hover:border-blue-200 hover:bg-blue-50", toolMode === item.id && activeToolClass)}>
            {item.label}
          </button>
        ))}
      </div>
    );
  }

  function renderCustomFields(fullscreen = false) {
    return (
      <div className={classNames("rounded-lg border border-blue-100 bg-blue-50/80 p-3", fullscreen && "bg-white/80 shadow-tight")}>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs font-extrabold uppercase text-blue-700">
            Minutes
            <input className="field bg-white text-center text-base font-black text-ink" type="number" min="0" max="180" value={customMinutes} onChange={event => updateCustomMinutes(event.target.value)} />
          </label>
          <label className="grid gap-1 text-xs font-extrabold uppercase text-blue-700">
            Seconds
            <input className="field bg-white text-center text-base font-black text-ink" type="number" min="0" max="59" value={customSeconds} onChange={event => updateCustomSeconds(event.target.value)} />
          </label>
        </div>
      </div>
    );
  }

  return (
    <div className="pomodoro-stage">
      <ToolShell view="pomodoro" eyebrow="Focus tools" title="Run focused study sprints" description="Use Pomodoro, custom countdowns, and a stopwatch for study sessions.">
        {renderToolButtons()}

        <div className="rounded-lg border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-5 text-center">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className={classNames("text-xs font-extrabold uppercase", accentTextClass)}>{activeTitle}</span>
              {toolMode !== "stopwatch" && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs font-extrabold text-amber-700">
                  <Volume1 size={13} />
                  Alarm
                </span>
              )}
            </div>
            <button type="button" className="ghost-btn min-h-10 px-3" onClick={() => setIsFullscreen(true)}>
              <Maximize2 size={16} />
              Full screen
            </button>
          </div>
          <div
            className="pomodoro-ring mx-auto mt-5 grid place-items-center rounded-full"
            style={{ background: `conic-gradient(${ringColor} ${boundedProgress}%, ${ringTrack} ${boundedProgress}% 100%)` }}
          >
            <div className="pomodoro-core grid place-items-center rounded-full border border-amber-100 bg-white shadow-tight">
              <div>
                <div className={classNames("text-xs font-extrabold uppercase", accentTextClass)}>{statusLabel}</div>
                <div className="mt-2 text-5xl font-black tracking-normal text-ink sm:text-6xl">{displayTime}</div>
                <div className="mt-2 text-sm font-bold text-muted">{progressText}</div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-4 flex max-w-sm items-center justify-between text-xs font-bold uppercase text-muted">
            <span>0</span>
            <span>{durationText}</span>
          </div>
        </div>

        {toolMode === "custom" && renderCustomFields()}

        {toolMode === "pomodoro" && (
          <div className="grid grid-cols-3 gap-2">
            {modeItems.map(item => (
              <button key={item} type="button" onClick={() => changeMode(item)} className={classNames("min-h-11 rounded-lg border border-line bg-white font-bold capitalize transition hover:border-amber-300 hover:bg-amber-50", mode === item && "border-amber-300 bg-amber-50 text-amber-800")}>
                {getModeLabel(item)}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="primary-btn" onClick={toggleTimer}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running ? "Pause" : "Start"}
          </button>
          <button type="button" className="ghost-btn" onClick={resetActiveTool}>
            <RotateCcw size={17} />
            Reset
          </button>
        </div>
      </ToolShell>

      {isFullscreen && (
        <section className="pomodoro-fullscreen" role="dialog" aria-modal="true" aria-label="Focus timer full screen mode">
          <div className="pomodoro-fullscreen-shell">
            <header className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className={classNames("inline-flex items-center gap-2 text-xs font-extrabold uppercase", accentTextClass)}>
                  <Clock3 size={15} />
                  {headerTitle}
                </span>
                <h2 className="mt-2 text-3xl font-black leading-tight text-ink sm:text-4xl">{activeTitle}</h2>
                {toolMode !== "stopwatch" && (
                  <span className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-white/85 px-3 py-1.5 text-xs font-extrabold uppercase text-amber-700">
                    <Volume1 size={14} />
                    Alarm on complete
                  </span>
                )}
              </div>
              <button type="button" className="ghost-btn bg-white" onClick={() => setIsFullscreen(false)}>
                <Minimize2 size={17} />
                Exit full screen
              </button>
            </header>

            <div className="pomodoro-fullscreen-main">
              <div
                className="pomodoro-focus-ring grid place-items-center rounded-full"
                style={{ background: `conic-gradient(${ringColor} ${boundedProgress}%, rgba(255,255,255,0.72) ${boundedProgress}% 100%)` }}
              >
                <div className="pomodoro-focus-core grid place-items-center rounded-full bg-white text-center shadow-soft">
                  <div>
                    <div className={classNames("text-sm font-extrabold uppercase", accentTextClass)}>{statusLabel}</div>
                    <div className="mt-3 text-[clamp(4rem,11vw,8rem)] font-black leading-none tracking-normal text-ink">{displayTime}</div>
                    <div className="mt-4 text-base font-bold text-muted">{toolMode === "stopwatch" ? progressText : `${Math.round(boundedProgress)}% left of ${durationText}`}</div>
                  </div>
                </div>
              </div>
            </div>

            <footer className="mx-auto grid w-full max-w-3xl gap-3">
              {renderToolButtons()}
              {toolMode === "custom" && renderCustomFields(true)}
              {toolMode === "pomodoro" && (
                <div className="grid grid-cols-3 gap-2">
                  {modeItems.map(item => (
                    <button key={item} type="button" onClick={() => changeMode(item)} className={classNames("min-h-12 rounded-lg border border-amber-200 bg-white px-3 font-extrabold text-muted shadow-tight transition hover:bg-amber-50", mode === item && "border-amber-400 bg-amber-50 text-amber-800")}>
                      {getModeLabel(item)}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" className="primary-btn min-h-14" onClick={toggleTimer}>
                  {running ? <Pause size={20} /> : <Play size={20} />}
                  {running ? "Pause" : "Start"}
                </button>
                <button type="button" className="ghost-btn min-h-14 bg-white" onClick={resetActiveTool}>
                  <RotateCcw size={19} />
                  Reset
                </button>
              </div>
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}

function taskFromStudyItem(item) {
  return {
    id: item._id || item.id,
    text: item.content || item.title,
    done: Boolean(item.done),
    createdAt: item.createdAt
  };
}

function TasksPanel({ token, user, onOpenAuth }) {
  const [goal, setGoal] = useState(() => token ? "" : getStoredStudyGoal());
  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState(() => token ? [] : getStoredStudyTasks());
  const [loading, setLoading] = useState(false);
  const [accountReady, setAccountReady] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadWorkspace() {
      if (!token) {
        setGoal(getStoredStudyGoal());
        setTasks(getStoredStudyTasks());
        setAccountReady(false);
        setMessage("");
        return;
      }

      setLoading(true);
      setAccountReady(false);

      try {
        const data = await apiRequest("/api/study-items?type=task,goal&limit=120", { token });
        const items = data.items || [];
        const savedGoal = items.find(item => item.type === "goal");
        let nextGoal = savedGoal?.content || "";
        let nextTasks = items.filter(item => item.type === "task").map(taskFromStudyItem);
        const localGoal = getStoredStudyGoal();
        const localTasks = getStoredStudyTasks();
        const knownTaskTexts = new Set(nextTasks.map(task => task.text.trim().toLowerCase()));
        const migratedTasks = [];
        let migrated = false;

        if (localGoal && !nextGoal) {
          const saved = await apiRequest("/api/study-items", {
            method: "POST",
            token,
            body: {
              type: "goal",
              title: "Today study goal",
              content: localGoal,
              category: "Progress"
            }
          });
          nextGoal = saved.item?.content || localGoal;
          migrated = true;
        }

        for (const localTask of localTasks) {
          const text = String(localTask.text || "").trim();
          const key = text.toLowerCase();

          if (!text || knownTaskTexts.has(key)) {
            continue;
          }

          const saved = await apiRequest("/api/study-items", {
            method: "POST",
            token,
            body: {
              type: "task",
              title: text,
              content: text,
              category: "Task",
              done: Boolean(localTask.done)
            }
          });

          migratedTasks.push(taskFromStudyItem(saved.item));
          knownTaskTexts.add(key);
          migrated = true;
        }

        if (migrated) {
          clearStoredStudyDrafts();
        }

        setGoal(nextGoal);
        setTasks([...migratedTasks, ...nextTasks]);
        setMessage(migrated ? "Local study drafts moved into your account." : "");
      } catch (error) {
        setMessage(friendlyError(error));
      } finally {
        setLoading(false);
        setAccountReady(true);
      }
    }

    loadWorkspace();
  }, [token]);

  useEffect(() => {
    if (!token) {
      localStorage.setItem(GOAL_STORAGE_KEY, goal);
      return undefined;
    }

    if (!accountReady) {
      return undefined;
    }

    const syncTimer = window.setTimeout(async () => {
      try {
        await apiRequest("/api/study-items", {
          method: "POST",
          token,
          body: {
            type: "goal",
            title: "Today study goal",
            content: goal,
            category: "Progress"
          }
        });
      } catch (error) {
        setMessage(friendlyError(error));
      }
    }, 600);

    return () => window.clearTimeout(syncTimer);
  }, [accountReady, goal, token]);

  useEffect(() => {
    if (!token) {
      localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
    }
  }, [tasks, token]);

  async function addTask() {
    const text = taskText.trim();
    if (!text) {
      return;
    }

    if (!token) {
      setTasks([{ id: crypto.randomUUID(), text, done: false }, ...tasks]);
      setTaskText("");
      setMessage("Sign in to sync this task to your account.");
      onOpenAuth();
      return;
    }

    try {
      const data = await apiRequest("/api/study-items", {
        method: "POST",
        token,
        body: {
          type: "task",
          title: text,
          content: text,
          category: "Task"
        }
      });
      setTasks([taskFromStudyItem(data.item), ...tasks]);
      setTaskText("");
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  async function updateTaskDone(task, done) {
    const previousTasks = tasks;
    setTasks(tasks.map(item => item.id === task.id ? { ...item, done } : item));

    if (!token) {
      return;
    }

    try {
      await apiRequest(`/api/study-items/${task.id}`, {
        method: "PATCH",
        token,
        body: { done }
      });
      setMessage("");
    } catch (error) {
      setTasks(previousTasks);
      setMessage(friendlyError(error));
    }
  }

  async function deleteTask(task) {
    const previousTasks = tasks;
    setTasks(tasks.filter(item => item.id !== task.id));

    if (!token) {
      return;
    }

    try {
      await apiRequest(`/api/study-items/${task.id}`, {
        method: "DELETE",
        token
      });
      setMessage("");
    } catch (error) {
      setTasks(previousTasks);
      setMessage(friendlyError(error));
    }
  }

  const completedTasks = tasks.filter(task => task.done).length;
  const taskProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <ToolShell view="tasks" eyebrow="Tasks" title="Plan goals and tasks" description="Set today's goal, add study tasks, and keep progress saved with your account.">
      <div className="rounded-lg border border-teal-100 bg-gradient-to-br from-teal-50 to-white p-4">
        <label className="grid gap-2 text-sm font-bold text-teal-800">
          Today's study goal
          <input className="field bg-white" placeholder="Example: Revise DBMS normalization" value={goal} onChange={event => setGoal(event.target.value)} />
        </label>
        <div className="mt-4 flex items-center justify-between text-sm font-bold text-muted">
          <span>{completedTasks}/{tasks.length} tasks complete</span>
          <span>{taskProgress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
          <span className="block h-full rounded-full bg-teal-600 transition-all" style={{ width: `${taskProgress}%` }} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-extrabold uppercase text-teal-700">
          <span>{user ? `Saved for ${user.name}` : "Sign in to sync progress"}</span>
          {loading && <span>Loading account tasks...</span>}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="field bg-white" placeholder="Add a focused task" value={taskText} onChange={event => setTaskText(event.target.value)} onKeyDown={event => event.key === "Enter" && addTask()} />
        <button className="primary-btn" onClick={addTask} disabled={loading}><Plus size={18} /> Add</button>
      </div>
      {message && <p className="rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">{message}</p>}
      <ul className="grid max-h-72 gap-2 overflow-auto">
        {!tasks.length && <li className="rounded-lg border border-line bg-slate-50 p-4 text-muted">No tasks yet. Add your first study task above.</li>}
        {tasks.map(task => (
          <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 shadow-tight">
            <label className="flex min-w-0 items-center gap-3">
              <input type="checkbox" checked={task.done} onChange={event => updateTaskDone(task, event.target.checked)} />
              <span className={classNames("break-words", task.done && "text-muted line-through")}>{task.text}</span>
            </label>
            <button className="text-muted hover:text-rose-600" onClick={() => deleteTask(task)}>
              <Trash2 size={17} />
            </button>
          </li>
        ))}
      </ul>
    </ToolShell>
  );
}

function getLibraryMeta(type) {
  if (type === "pdf") {
    return {
      label: "PDF",
      icon: UploadCloud,
      badge: "border-blue-200 bg-blue-50 text-blue-700"
    };
  }

  if (type === "youtube") {
    return {
      label: "YouTube",
      icon: Play,
      badge: "border-rose-200 bg-rose-50 text-rose-700"
    };
  }

  return {
    label: "Notes",
    icon: FileText,
    badge: "border-teal-200 bg-teal-50 text-teal-700"
  };
}

function SavedLibraryPanel({ token, user, onOpenAuth }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [activeItemId, setActiveItemId] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadItems() {
    if (!token) {
      setItems([]);
      setActiveItemId("");
      setMessage("");
      return;
    }

    setLoading(true);

    try {
      const data = await apiRequest("/api/study-items?type=note,pdf,youtube&limit=80", { token });
      const nextItems = data.items || [];
      setItems(nextItems);
      setActiveItemId(current => nextItems.some(item => item._id === current) ? current : nextItems[0]?._id || "");
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadItems();
  }, [token]);

  const filteredItems = useMemo(() => {
    return filter === "all" ? items : items.filter(item => item.type === filter);
  }, [filter, items]);

  useEffect(() => {
    if (!filteredItems.length) {
      setActiveItemId("");
      return;
    }

    if (!filteredItems.some(item => item._id === activeItemId)) {
      setActiveItemId(filteredItems[0]._id);
    }
  }, [activeItemId, filteredItems]);

  async function deleteSavedItem(item) {
    const previousItems = items;
    const nextItems = items.filter(savedItem => savedItem._id !== item._id);
    setItems(nextItems);
    setActiveItemId(current => current === item._id ? nextItems[0]?._id || "" : current);

    try {
      await apiRequest(`/api/study-items/${item._id}`, {
        method: "DELETE",
        token
      });
      setMessage("");
    } catch (error) {
      setItems(previousItems);
      setMessage(friendlyError(error));
    }
  }

  const activeItem = filteredItems.find(item => item._id === activeItemId) || filteredItems[0];
  const filters = [
    ["all", "All"],
    ["note", "Notes"],
    ["pdf", "PDF"],
    ["youtube", "YouTube"]
  ];

  if (!token) {
    return (
      <section className="mt-7 grid min-h-[calc(100vh-8rem)] place-items-center rounded-xl border border-line bg-white p-5 shadow-tight">
        <div className="w-full max-w-md rounded-lg border border-amber-100 bg-amber-50 p-5">
          <span className="eyebrow text-amber-700"><ShieldCheck size={15} /> Account required</span>
          <h2 className="mt-2 text-2xl font-extrabold text-ink">Sign in to open your library</h2>
          <p className="mt-2 leading-7 text-muted">Your saved notes, summaries, playlists, and tasks stay with your account.</p>
          <button type="button" className="primary-btn mt-4" onClick={onOpenAuth}>
            <User size={18} />
            Sign in
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mt-5 grid min-h-[calc(100vh-7.5rem)] overflow-hidden rounded-xl border border-line bg-white shadow-tight lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="flex min-h-[22rem] flex-col border-b border-line bg-slate-50/80 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-line p-3">
          <div className="min-w-0">
            <strong className="block truncate text-sm text-ink">{user ? user.name : "Library"}</strong>
            <span className="text-xs font-bold uppercase text-muted">{items.length} saved</span>
          </div>
          <button type="button" className="icon-btn h-9 w-9 shrink-0 bg-white" onClick={loadItems} disabled={loading} title="Refresh">
            {loading ? <Loader2 className="animate-spin" size={16} /> : <RotateCcw size={16} />}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-line p-3 sm:grid-cols-4 lg:grid-cols-2">
          {filters.map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={classNames("min-h-9 rounded-md border border-line bg-white px-3 text-xs font-extrabold text-muted transition hover:border-teal-300 hover:bg-teal-50", filter === value && "border-teal-300 bg-teal-50 text-teal-800")}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {message && <p className="m-3 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{message}</p>}

        {!filteredItems.length && (
          <div className="m-3 rounded-lg border border-line bg-white p-4 text-sm text-muted">
            {loading ? "Loading..." : "No saved items yet."}
          </div>
        )}

        {!!filteredItems.length && (
          <div className="grid flex-1 content-start gap-2 overflow-auto p-3">
            {filteredItems.map(item => {
              const meta = getLibraryMeta(item.type);
              const Icon = meta.icon;

              return (
                <button
                  key={item._id}
                  type="button"
                  onClick={() => setActiveItemId(item._id)}
                  className={classNames(
                    "rounded-lg border bg-white p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40",
                    activeItem?._id === item._id ? "border-teal-300 shadow-tight ring-2 ring-teal-100" : "border-transparent"
                  )}
                >
                  <span className={classNames("inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[0.68rem] font-extrabold uppercase", meta.badge)}>
                    <Icon size={13} />
                    {meta.label}
                  </span>
                  <strong className="mt-2 line-clamp-2 block text-sm leading-snug text-ink">{item.title}</strong>
                  <span className="mt-1 block text-xs font-bold text-muted">{formatSavedDate(item.createdAt)}</span>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted">{getPreviewText(item.content, 110)}</p>
                </button>
              );
            })}
          </div>
        )}
      </aside>

      <main className="flex min-h-[calc(100vh-7.5rem)] min-w-0 flex-col bg-white">
        {activeItem ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-white px-4 py-3 sm:px-6">
              <div className="min-w-0">
                <span className={classNames("inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-extrabold uppercase", getLibraryMeta(activeItem.type).badge)}>
                  {getLibraryMeta(activeItem.type).label}
                </span>
                <h2 className="mt-2 truncate text-xl font-extrabold text-ink">{activeItem.title}</h2>
                <p className="mt-1 text-sm text-muted">{formatSavedDate(activeItem.createdAt)}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeItem.sourceUrl && (
                  <a href={activeItem.sourceUrl} target="_blank" rel="noreferrer" className="ghost-btn bg-white">
                    Open source <ArrowRight size={16} />
                  </a>
                )}
                <button type="button" className="ghost-btn bg-white text-rose-700 hover:bg-rose-50" onClick={() => deleteSavedItem(activeItem)}>
                  <Trash2 size={17} />
                  Delete
                </button>
              </div>
            </div>
            <article className="min-h-0 flex-1 overflow-auto">
              <div className="notes-output generation-output mx-auto w-full max-w-5xl px-5 py-6 sm:px-8 lg:px-10" dangerouslySetInnerHTML={{ __html: markdownToHTML(activeItem.content) }} />
            </article>
          </>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-muted">
            <div>
              <FileText className="mx-auto text-slate-300" size={36} />
              <p className="mt-3 font-semibold">Select a saved item to read.</p>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}

function MusicPanel() {
  const [sound, setSound] = useState("rain");
  const [volume, setVolume] = useState(35);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);

  function stopSound(updateState = true) {
    audioRef.current?.nodes?.forEach(node => {
      try {
        node.stop?.();
        node.disconnect?.();
      } catch (error) {
        node.disconnect?.();
      }
    });
    audioRef.current?.context?.close?.();
    audioRef.current = null;
    if (updateState) {
      setPlaying(false);
    }
  }

  function startSound() {
    stopSound(false);
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }

    const context = new AudioContext();
    const gain = context.createGain();
    gain.gain.value = Math.max(0.02, (volume / 100) * 0.35);
    gain.connect(context.destination);

    const frequencies = sound === "rain" ? [180, 260, 420] : sound === "deep" ? [90, 130, 170] : [220, 340, 520];
    const nodes = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      oscillator.type = sound === "white" ? "sawtooth" : "sine";
      oscillator.frequency.value = frequency;
      filter.type = "lowpass";
      filter.frequency.value = 240 + index * 130;
      oscillator.connect(filter).connect(gain);
      oscillator.start();
      return oscillator;
    });

    audioRef.current = { context, nodes, gain };
    setPlaying(true);
  }

  useEffect(() => {
    if (audioRef.current?.gain) {
      audioRef.current.gain.gain.value = Math.max(0.02, (volume / 100) * 0.35);
    }
  }, [volume]);

  useEffect(() => {
    if (playing) {
      startSound();
    }
  }, [sound]);

  useEffect(() => () => stopSound(false), []);

  return (
    <ToolShell view="music" eyebrow="Focus music" title="Play ambient study sound" description="Choose a sound profile and keep it low while you read, revise, or code.">
      <div className="grid gap-4 rounded-lg border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-4">
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["rain", "Soft rain"],
            ["deep", "Deep focus"],
            ["white", "White noise"]
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setSound(value)}
              className={classNames(
                "min-h-11 rounded-lg border border-line bg-white px-3 text-sm font-bold text-muted transition hover:border-indigo-300 hover:bg-indigo-50",
                sound === value && "border-indigo-300 bg-indigo-50 text-indigo-700"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex h-16 items-end justify-center gap-1 rounded-lg border border-white bg-white/70 p-3">
          {[28, 44, 34, 58, 42, 64, 38, 52, 30, 46].map((height, index) => (
            <span key={index} className={classNames("w-2 rounded-full bg-indigo-500/70", playing && "music-bar")} style={{ height: `${height}%`, animationDelay: `${index * 0.08}s` }} />
          ))}
        </div>
        <label className="grid gap-2 text-sm font-bold text-slate-700">
          Volume
          <input type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} />
        </label>
      </div>
      <button className="primary-btn" onClick={playing ? stopSound : startSound}>
        {playing ? <Music2 size={18} /> : <Headphones size={18} />}
        {playing ? "Stop Focus" : "Play Focus"}
      </button>
    </ToolShell>
  );
}

function ToolShell({ view, eyebrow, title, description, children }) {
  const meta = VIEW_META[view] || VIEW_META.pdf;
  const tone = TONE_CLASSES[meta.tone] || TONE_CLASSES.blue;
  const Icon = meta.icon;

  return (
    <section className={classNames("mt-7 grid overflow-hidden rounded-xl border border-white/80 bg-gradient-to-br p-4 shadow-soft sm:p-6 lg:grid-cols-[0.84fr_1.16fr]", tone.shell)}>
      <div className="relative flex min-h-64 flex-col justify-between gap-6 p-1 sm:p-2">
        <span className={classNames("absolute left-0 top-2 h-16 w-1 rounded-full", tone.rail)} />
        <div>
          <span className="eyebrow pl-4"><Sparkles size={15} /> {eyebrow}</span>
          <h2 className="mt-3 max-w-md pl-4 text-3xl font-black leading-tight text-ink sm:text-4xl">{title}</h2>
          <p className="mt-3 max-w-md leading-7 text-muted">{description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className={classNames("rounded-lg border px-4 py-3 text-sm font-bold", tone.soft)}>
            <span className="block text-xs uppercase opacity-70">Mode</span>
            {meta.metric}
          </div>
          <div className="rounded-lg border border-line bg-white/80 px-4 py-3 text-sm font-bold text-slate-700">
            <span className="block text-xs uppercase text-muted">Workflow</span>
            {meta.detail}
          </div>
        </div>
      </div>

      <article className="relative grid gap-4 rounded-lg border border-white/80 bg-white/[0.94] p-5 shadow-tight backdrop-blur">
        <span className={classNames("absolute -top-5 right-5 grid h-12 w-12 place-items-center rounded-lg shadow-lg", tone.icon)}>
          <Icon size={22} />
        </span>
        {children}
      </article>
    </section>
  );
}

function HomePage({ activeView, setActiveView, result, setResult, token, user, onOpenAuth }) {
  const generationIdRef = useRef(0);
  const typingTimerRef = useRef(null);
  const typingResolveRef = useRef(null);
  const typingTargetRef = useRef("");
  const typingTextRef = useRef("");
  const typingCompleteRef = useRef(false);

  useEffect(() => () => stopTypingAnimation(), []);

  function stopTypingAnimation() {
    if (typingTimerRef.current) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }

    if (typingResolveRef.current) {
      typingResolveRef.current(typingTextRef.current);
      typingResolveRef.current = null;
    }
  }

  function startTypingAnimation(view, generationId) {
    stopTypingAnimation();
    typingTargetRef.current = "";
    typingTextRef.current = "";
    typingCompleteRef.current = false;

    return new Promise(resolve => {
      typingResolveRef.current = resolve;
      typingTimerRef.current = window.setInterval(() => {
        if (generationId !== generationIdRef.current) {
          stopTypingAnimation();
          resolve("");
          return;
        }

        const targetText = typingTargetRef.current;
        const visibleText = typingTextRef.current;

        if (visibleText.length < targetText.length) {
          const remainingCharacters = targetText.length - visibleText.length;
          const step = Math.min(
            TYPING_MAX_CHARS,
            Math.max(TYPING_MIN_CHARS, Math.ceil(remainingCharacters / 28)),
            remainingCharacters
          );
          const nextText = targetText.slice(0, visibleText.length + step);
          typingTextRef.current = nextText;
          setResult({
            status: "loading",
            html: markdownToHTML(nextText),
            text: nextText,
            error: "",
            view,
            isTyping: true
          });
          return;
        }

        if (typingCompleteRef.current) {
          stopTypingAnimation();
          resolve(targetText);
        }
      }, TYPING_INTERVAL_MS);
    });
  }

  async function generate(payload, view) {
    const generationId = generationIdRef.current + 1;
    generationIdRef.current = generationId;
    setActiveView(view);
    setResult({ status: "loading", html: "", text: "", error: "", view, isTyping: true });
    const typingPromise = startTypingAnimation(view, generationId);

    try {
      let latestText = "";
      await streamGenerateNotes(payload, text => {
        if (generationId !== generationIdRef.current) {
          return;
        }
        latestText = text;
        typingTargetRef.current = text;
      });
      typingTargetRef.current = latestText;
      typingCompleteRef.current = true;
      const finalText = await typingPromise;

      if (generationId !== generationIdRef.current) {
        return;
      }

      const savedPayload = createSavedStudyPayload(payload, view, finalText);

      setResult({
        status: "done",
        html: markdownToHTML(finalText),
        text: finalText,
        error: "",
        view,
        isTyping: false,
        savedPayload,
        saveStatus: token ? "saving" : "needs-auth",
        saveMessage: token ? "Saving to account..." : "Sign in to save this result to your account."
      });

      if (!token) {
        return;
      }

      try {
        const saved = await apiRequest("/api/study-items", {
          method: "POST",
          token,
          body: savedPayload
        });

        if (generationId !== generationIdRef.current) {
          return;
        }

        setResult(current => ({
          ...current,
          savedItemId: saved.item?._id,
          saveStatus: "saved",
          saveMessage: "Saved to account library"
        }));
      } catch (saveError) {
        if (generationId !== generationIdRef.current) {
          return;
        }

        setResult(current => ({
          ...current,
          saveStatus: "error",
          saveMessage: friendlyError(saveError)
        }));
      }
    } catch (error) {
      stopTypingAnimation();
      setResult({
        status: "error",
        html: "",
        text: "",
        error: friendlyError(error),
        view,
        isTyping: false
      });
    }
  }

  async function saveCurrentResult() {
    if (!token) {
      onOpenAuth();
      return;
    }

    if (!result.savedPayload || result.saveStatus === "saved") {
      return;
    }

    setResult(current => ({
      ...current,
      saveStatus: "saving",
      saveMessage: "Saving to account..."
    }));

    try {
      const saved = await apiRequest("/api/study-items", {
        method: "POST",
        token,
        body: result.savedPayload
      });

      setResult(current => ({
        ...current,
        savedItemId: saved.item?._id,
        saveStatus: "saved",
        saveMessage: "Saved to account library"
      }));
    } catch (error) {
      setResult(current => ({
        ...current,
        saveStatus: "error",
        saveMessage: friendlyError(error)
      }));
    }
  }

  return (
    <>
      {activeView === "home" && <HomePanel onGenerate={generate} />}
      {activeView === "pdf" && <PdfPanel onGenerate={generate} />}
      {activeView === "video" && <VideoPanel onGenerate={generate} />}
      {activeView === "library" && <SavedLibraryPanel token={token} user={user} onOpenAuth={onOpenAuth} />}
      {activeView === "pomodoro" && <PomodoroPanel />}
      {activeView === "tasks" && <TasksPanel token={token} user={user} onOpenAuth={onOpenAuth} />}
      {activeView === "music" && <MusicPanel />}
      {["home", "pdf", "video"].includes(activeView) && <NotesResult result={result} activeView={activeView} token={token} onOpenAuth={onOpenAuth} onSaveResult={saveCurrentResult} />}
    </>
  );
}

function LectureCard({ lecture, custom, onDelete }) {
  return (
    <article className="group overflow-hidden rounded-lg border border-line bg-white shadow-tight transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-soft">
      <a href={lecture.url} target="_blank" rel="noreferrer" className="relative block aspect-video overflow-hidden bg-slate-100">
        <img src={lecture.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80"} alt={`${lecture.title} thumbnail`} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
        <span className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-white text-blue-700 shadow-soft">
          <Play size={18} />
        </span>
      </a>
      <div className="grid min-h-52 gap-2 p-4">
        <span className="w-fit rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-extrabold uppercase text-blue-700">{lecture.label || lecture.category}</span>
        <h2 className="text-lg font-extrabold leading-snug text-ink">{lecture.title}</h2>
        <p className="leading-7 text-muted">{lecture.description || lecture.notes || "Saved personal playlist."}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <a href={lecture.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 font-bold text-blue-700">
            Open Playlist <ArrowRight size={16} />
          </a>
          {custom && (
            <button className="grid h-9 w-9 place-items-center rounded-lg border border-line text-muted hover:bg-rose-50 hover:text-rose-600" onClick={onDelete}>
              <Trash2 size={17} />
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function LecturesPage({ token, user, onOpenAuth }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [playlists, setPlaylists] = useState([]);
  const [form, setForm] = useState({ title: "", url: "", category: "programming", notes: "" });
  const [message, setMessage] = useState("");

  async function loadPlaylists() {
    if (!token) {
      setPlaylists([]);
      return;
    }

    try {
      const data = await apiRequest("/api/playlists", { token });
      setPlaylists(data.playlists || []);
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  useEffect(() => {
    loadPlaylists();
  }, [token]);

  async function addPlaylist(event) {
    event.preventDefault();

    if (!token) {
      onOpenAuth();
      return;
    }

    try {
      const data = await apiRequest("/api/playlists", {
        method: "POST",
        token,
        body: form
      });
      setPlaylists([data.playlist, ...playlists]);
      setForm({ title: "", url: "", category: "programming", notes: "" });
      setMessage("");
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  async function deletePlaylist(id) {
    try {
      await apiRequest(`/api/playlists/${id}`, {
        method: "DELETE",
        token
      });
      setPlaylists(playlists.filter(item => item._id !== id));
    } catch (error) {
      setMessage(friendlyError(error));
    }
  }

  const filteredLectures = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return curatedLectures.filter(lecture => {
      const categoryMatch = filter === "all" || lecture.category === filter;
      const queryMatch = !normalizedQuery || `${lecture.title} ${lecture.search}`.toLowerCase().includes(normalizedQuery);
      return categoryMatch && queryMatch;
    });
  }, [filter, query]);

  return (
    <>
      <section className="mt-7 grid gap-5 overflow-hidden rounded-xl border border-white/80 bg-gradient-to-br from-white via-blue-50 to-teal-50 p-5 shadow-soft lg:grid-cols-[1fr_380px] lg:items-center">
        <div>
          <span className="eyebrow"><BookOpen size={15} /> Curated lectures</span>
          <h1 className="mt-2 text-4xl font-black leading-tight text-ink">Watch lectures with thumbnails.</h1>
          <p className="mt-3 leading-7 text-muted">Search by topic, open curated lectures, or save your own MongoDB-backed playlists.</p>
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {[
              ["6", "Curated sets"],
              ["4", "Study tracks"],
              ["HD", "Thumbnails"]
            ].map(([value, label]) => (
              <div key={label} className="rounded-lg border border-white/80 bg-white/80 p-3 shadow-tight">
                <strong className="block text-xl text-ink">{value}</strong>
                <span className="text-xs font-bold uppercase text-muted">{label}</span>
              </div>
            ))}
          </div>
        </div>
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="field bg-white pl-10" type="search" placeholder="Search lectures, creators, or subjects" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", "programming", "web", "dsa", "cs"].map(item => (
          <button key={item} className={classNames("min-h-10 rounded-lg border border-line bg-white px-4 font-bold capitalize shadow-tight transition hover:border-blue-300 hover:bg-blue-50", filter === item && "border-blue-300 bg-blue-50 text-blue-700")} onClick={() => setFilter(item)}>
            {item === "cs" ? "CS Core" : item}
          </button>
        ))}
      </div>

      <section className="section-panel mt-5 bg-white/95">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow"><Bookmark size={15} /> Your playlists</span>
            <h2 className="mt-2 text-2xl font-extrabold">Create your own playlist</h2>
          </div>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
            {user ? user.name : "Sign in required"}
          </span>
        </div>

        <form onSubmit={addPlaylist} className="mt-5 grid gap-3 rounded-lg border border-line bg-slate-50 p-4 lg:grid-cols-[1fr_1.3fr_140px_1fr_auto]">
          <input className="field bg-white" placeholder="Playlist title" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required />
          <input className="field bg-white" placeholder="YouTube playlist or video link" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} required />
          <select className="field bg-white" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
            <option value="programming">Programming</option>
            <option value="web">Web</option>
            <option value="dsa">DSA</option>
            <option value="cs">CS Core</option>
            <option value="custom">Custom</option>
          </select>
          <input className="field bg-white" placeholder="Short note or topic" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
          <button className="primary-btn"><Plus size={18} /> Add</button>
        </form>
        {message && <p className="mt-3 text-sm font-semibold text-rose-600">{message}</p>}

        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {playlists.map(playlist => (
            <LectureCard key={playlist._id} lecture={playlist} custom onDelete={() => deletePlaylist(playlist._id)} />
          ))}
        </div>
        {!token && <p className="mt-4 text-muted">Sign in to save playlists in MongoDB.</p>}
        {token && !playlists.length && <p className="mt-4 text-muted">No custom playlists yet.</p>}
      </section>

      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        {filteredLectures.map(lecture => <LectureCard key={lecture.title} lecture={lecture} />)}
      </section>
      {!filteredLectures.length && <p className="mt-5 text-muted">No lectures matched your search.</p>}
    </>
  );
}

function App() {
  const storedAuth = parseStoredAuth();
  const [page, setPage] = useState(() => window.location.pathname.startsWith("/lectures") ? "lectures" : "home");
  const [activeView, setActiveView] = useState("home");
  const [authOpen, setAuthOpen] = useState(false);
  const [token, setToken] = useState(storedAuth?.token || "");
  const [user, setUser] = useState(storedAuth?.user || null);
  const [result, setResult] = useState({
    status: "idle",
    html: "",
    text: "",
    error: "",
    view: "home"
  });

  useEffect(() => {
    const onPop = () => {
      setPage(window.location.pathname.startsWith("/lectures") ? "lectures" : "home");
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  function persistAuth(data) {
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  }

  function logout() {
    setToken("");
    setUser(null);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setAuthOpen(false);
  }

  function navigateHome(view = "home") {
    setPage("home");
    setActiveView(view);
    window.history.pushState(null, "", "/");
  }

  function navigateLectures() {
    setPage("lectures");
    window.history.pushState(null, "", "/lectures");
  }

  return (
    <Layout
      page={page}
      activeView={activeView}
      user={user}
      onNavigateHome={navigateHome}
      onNavigateLectures={navigateLectures}
      onOpenAuth={() => setAuthOpen(true)}
    >
      {page === "home" ? (
        <HomePage activeView={activeView} setActiveView={setActiveView} result={result} setResult={setResult} token={token} user={user} onOpenAuth={() => setAuthOpen(true)} />
      ) : (
        <LecturesPage token={token} user={user} onOpenAuth={() => setAuthOpen(true)} />
      )}

      <AuthModal open={authOpen} user={user} onClose={() => setAuthOpen(false)} onAuth={persistAuth} onLogout={logout} />
    </Layout>
  );
}

export default App;
