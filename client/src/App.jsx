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
  Layers3,
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
const POMODORO_DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};

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

function classNames(...items) {
  return items.filter(Boolean).join(" ");
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

function AuthModal({ open, user, onClose, onAuth, onLogout }) {
  const [mode, setMode] = useState("signup");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setError("");
      setForm({ name: "", email: "", password: "" });
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

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-md">
      <section className="relative grid w-[min(880px,100%)] overflow-hidden rounded-xl border border-white/80 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)] md:grid-cols-[0.85fr_1.15fr]">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 z-10 icon-btn bg-white/90" title="Close">
          <X size={18} />
        </button>

        <aside className="relative overflow-hidden bg-gradient-to-br from-slate-950 via-blue-950 to-teal-900 p-6 text-white">
          <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-300 via-blue-300 to-amber-200" />
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-white/[0.12] ring-1 ring-white/20">
            <ShieldCheck size={24} />
          </span>
          <h2 className="mt-6 text-3xl font-black leading-tight">
            {user ? "Your study profile is active" : "Secure study account"}
          </h2>
          <p className="mt-3 text-sm leading-7 text-blue-50/85">
            {user
              ? "Your playlists and saved study workspace are connected to your profile."
              : "Create a profile once, then keep playlists and study progress tied to your account."}
          </p>

          <div className="mt-7 grid gap-3">
            {[
              ["MongoDB profile", "Account data stored on the backend"],
              ["JWT session", "Protected playlist actions"],
              ["Private playlists", "Saved per signed-in student"]
            ].map(([title, detail]) => (
              <div key={title} className="rounded-lg border border-white/[0.15] bg-white/[0.10] p-3">
                <strong className="block text-sm">{title}</strong>
                <span className="mt-1 block text-xs text-blue-50/75">{detail}</span>
              </div>
            ))}
          </div>
        </aside>

        <div className="p-6 sm:p-7">
          <span className="eyebrow"><User size={14} /> Account access</span>
          <h2 className="mt-3 text-2xl font-extrabold text-ink">
            {user ? "Account active" : mode === "login" ? "Welcome back" : "Create your account"}
          </h2>
          <p className="mt-2 leading-7 text-muted">
            {user
              ? `You are signed in as ${user.name} (${user.email}).`
              : mode === "login"
                ? "Enter your credentials to continue your study session."
                : "Add your name, email, and password to start saving playlists."}
          </p>

          {!user && (
            <>
              <div className="mt-5 grid grid-cols-2 gap-1 rounded-lg border border-line bg-slate-50 p-1">
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

              <form onSubmit={submitAuth} className="mt-5 grid gap-3">
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
                <button className="primary-btn min-h-12" disabled={loading}>
                  {loading ? <Loader2 className="animate-spin" size={18} /> : mode === "signup" ? <UserPlus size={18} /> : <ArrowRight size={18} />}
                  {mode === "signup" ? "Create account" : "Log in"}
                </button>
              </form>
            </>
          )}

          {user && (
            <div className="mt-6 rounded-lg border border-line bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-lg bg-teal-600 text-white">
                  <CheckCircle2 size={21} />
                </span>
                <div className="min-w-0">
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
        </div>
      </section>
    </div>
  );
}

function NotesResult({ result, activeView }) {
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
        <div className="mx-auto grid max-w-2xl gap-5 rounded-lg border border-blue-100 bg-gradient-to-br from-white via-blue-50 to-teal-50 p-6 shadow-soft">
          <div className="flex items-center gap-4">
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
          {result.html && <div className="notes-output" dangerouslySetInnerHTML={{ __html: result.html }} />}
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
        <>
          <div className="mb-4 flex justify-end">
            <button type="button" className="ghost-btn" onClick={() => window.print()}>
              <Download size={18} />
              Print / Save PDF
            </button>
          </div>
          <div className="notes-output" dangerouslySetInnerHTML={{ __html: result.html }} />
        </>
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
    onGenerate(form, "home");
  }

  function useCategory(item) {
    const nextForm = { ...form, prompt: item.prompt, category: item.category };
    setForm(nextForm);
    onGenerate(nextForm, "home");
  }

  return (
    <>
      <section className="relative py-6 sm:py-9">
        <div className="home-ambient" aria-hidden="true" />
        <div className="grid items-stretch gap-5 lg:grid-cols-[1fr_360px]">
          <div className="hero-panel relative overflow-hidden rounded-xl border border-white/80 bg-white/[0.9] p-5 shadow-soft backdrop-blur sm:p-7">
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

          <aside className="grid content-between gap-3 rounded-xl border border-white/80 bg-slate-950 p-4 text-white shadow-soft">
            <div>
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 text-teal-200 ring-1 ring-white/15">
                <Layers3 size={21} />
              </span>
              <h2 className="mt-4 text-2xl font-black leading-tight">Study workflow in one place</h2>
              <p className="mt-2 text-sm leading-6 text-slate-300">Notes, summaries, playlists, focus time, tasks, and sound tools stay in a clean workspace.</p>
            </div>
            <div className="grid gap-2">
              {[
                ["AI notes", "Prompt, PDF, and video"],
                ["Planner", "Goals and task tracking"],
                ["Focus mode", "Timer and ambient audio"]
              ].map(([title, detail]) => (
                <div key={title} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.06] p-3">
                  <span className="grid h-8 w-8 place-items-center rounded-md bg-white text-blue-700">
                    <CheckCircle2 size={16} />
                  </span>
                  <div>
                    <strong className="block text-sm">{title}</strong>
                    <span className="text-xs text-slate-300">{detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </aside>
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
        prompt: [
          `Create clear study notes from this PDF: ${extracted.fileName}.`,
          `Pages read: ${extracted.pageLimit} of ${extracted.pageCount}.`,
          extracted.text.slice(0, 28000)
        ].join("\n\n"),
        category: "PDF Summary",
        language: "English",
        depth: "detailed classroom notes"
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
        depth: "detailed classroom notes"
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
  const [mode, setMode] = useState("focus");
  const [remaining, setRemaining] = useState(POMODORO_DURATIONS.focus);
  const [running, setRunning] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const pomodoroRef = useRef(null);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRemaining(value => Math.max(0, value - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (remaining === 0) {
      setRunning(false);
    }
  }, [remaining]);

  useEffect(() => {
    function syncFullscreenState() {
      if (document.fullscreenElement === pomodoroRef.current) {
        setIsFullscreen(true);
        return;
      }

      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    }

    document.addEventListener("fullscreenchange", syncFullscreenState);
    return () => document.removeEventListener("fullscreenchange", syncFullscreenState);
  }, []);

  useEffect(() => {
    function closeExpandedMode(event) {
      if (event.key === "Escape" && isFullscreen && !document.fullscreenElement) {
        setIsFullscreen(false);
      }
    }

    window.addEventListener("keydown", closeExpandedMode);
    return () => window.removeEventListener("keydown", closeExpandedMode);
  }, [isFullscreen]);

  function changeMode(nextMode) {
    setMode(nextMode);
    setRunning(false);
    setRemaining(POMODORO_DURATIONS[nextMode]);
  }

  function toggleTimer() {
    if (remaining === 0) {
      setRemaining(POMODORO_DURATIONS[mode]);
    }
    setRunning(value => !value);
  }

  async function toggleFullscreen() {
    if (!pomodoroRef.current) {
      return;
    }

    if (document.fullscreenElement === pomodoroRef.current) {
      await document.exitFullscreen();
      return;
    }

    if (isFullscreen) {
      setIsFullscreen(false);
      return;
    }

    if (document.fullscreenEnabled && pomodoroRef.current.requestFullscreen) {
      try {
        await pomodoroRef.current.requestFullscreen();
        setIsFullscreen(true);
        return;
      } catch (error) {
        setIsFullscreen(true);
        return;
      }
    }

    setIsFullscreen(true);
  }

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");
  const progress = (remaining / POMODORO_DURATIONS[mode]) * 100;
  const modeLabels = {
    focus: "Deep focus",
    short: "Short break",
    long: "Long break"
  };

  return (
    <div ref={pomodoroRef} className={classNames("pomodoro-stage", isFullscreen && "pomodoro-stage-expanded")}>
      <ToolShell view="pomodoro" eyebrow="Pomodoro" title="Run focused study sprints" description="Use focus and break modes to study with a simple Pomodoro timer.">
        <div className="rounded-lg border border-amber-100 bg-gradient-to-br from-amber-50 to-white p-5 text-center">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-extrabold uppercase text-amber-700">{modeLabels[mode]}</span>
            <button type="button" className="ghost-btn min-h-10 px-3" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              {isFullscreen ? "Exit full screen" : "Full screen"}
            </button>
          </div>
          <div
            className={classNames("pomodoro-ring mx-auto mt-5 grid place-items-center rounded-full", isFullscreen && "pomodoro-ring-expanded")}
            style={{
              background: `conic-gradient(#f59e0b ${progress}%, #fff7ed ${progress}% 100%)`,
              width: isFullscreen ? "34rem" : undefined,
              maxWidth: isFullscreen ? "86vw" : undefined,
              marginBlock: isFullscreen ? "7rem" : undefined,
              transform: isFullscreen ? "scale(1.5)" : undefined
            }}
          >
            <div className="pomodoro-core grid place-items-center rounded-full border border-amber-100 bg-white shadow-tight">
              <div>
                <div className="text-xs font-extrabold uppercase text-amber-700">{running ? "Running" : "Ready"}</div>
                <div className="mt-2 text-5xl font-black tracking-normal text-ink sm:text-6xl">{minutes}:{seconds}</div>
                <div className="mt-2 text-sm font-bold text-muted">{Math.round(progress)}% left</div>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-4 flex max-w-sm items-center justify-between text-xs font-bold uppercase text-muted">
            <span>0</span>
            <span>{mode === "focus" ? "25 min" : mode === "short" ? "5 min" : "15 min"}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {["focus", "short", "long"].map(item => (
            <button key={item} type="button" onClick={() => changeMode(item)} className={classNames("min-h-11 rounded-lg border border-line bg-white font-bold capitalize transition hover:border-amber-300 hover:bg-amber-50", mode === item && "border-amber-300 bg-amber-50 text-amber-800")}>
              {item === "short" ? "Break" : item === "long" ? "Long" : "Focus"}
            </button>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <button type="button" className="primary-btn" onClick={toggleTimer}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            {running ? "Pause" : "Start"}
          </button>
          <button type="button" className="ghost-btn" onClick={() => changeMode(mode)}>
            <RotateCcw size={17} />
            Reset
          </button>
        </div>
      </ToolShell>
    </div>
  );
}

function TasksPanel() {
  const [goal, setGoal] = useState(() => {
    const currentGoal = localStorage.getItem(GOAL_STORAGE_KEY);
    const legacyGoal = localStorage.getItem(LEGACY_GOAL_STORAGE_KEY);

    if (!currentGoal && legacyGoal) {
      localStorage.setItem(GOAL_STORAGE_KEY, legacyGoal);
      localStorage.removeItem(LEGACY_GOAL_STORAGE_KEY);
      return legacyGoal;
    }

    return currentGoal || "";
  });
  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState(() => {
    try {
      const currentTasks = localStorage.getItem(TASK_STORAGE_KEY);
      const legacyTasks = localStorage.getItem(LEGACY_TASK_STORAGE_KEY);

      if (!currentTasks && legacyTasks) {
        localStorage.setItem(TASK_STORAGE_KEY, legacyTasks);
        localStorage.removeItem(LEGACY_TASK_STORAGE_KEY);
        return JSON.parse(legacyTasks || "[]");
      }

      return JSON.parse(localStorage.getItem(TASK_STORAGE_KEY) || "[]");
    } catch (error) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(GOAL_STORAGE_KEY, goal);
  }, [goal]);

  useEffect(() => {
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks]);

  function addTask() {
    const text = taskText.trim();
    if (!text) {
      return;
    }
    setTasks([{ id: crypto.randomUUID(), text, done: false }, ...tasks]);
    setTaskText("");
  }

  const completedTasks = tasks.filter(task => task.done).length;
  const taskProgress = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;

  return (
    <ToolShell view="tasks" eyebrow="Tasks" title="Plan goals and tasks" description="Set today's goal, add study tasks, and mark them complete as you work.">
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
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="field bg-white" placeholder="Add a focused task" value={taskText} onChange={event => setTaskText(event.target.value)} onKeyDown={event => event.key === "Enter" && addTask()} />
        <button className="primary-btn" onClick={addTask}><Plus size={18} /> Add</button>
      </div>
      <ul className="grid max-h-72 gap-2 overflow-auto">
        {!tasks.length && <li className="rounded-lg border border-line bg-slate-50 p-4 text-muted">No tasks yet. Add your first study task above.</li>}
        {tasks.map(task => (
          <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-white p-3 shadow-tight">
            <label className="flex min-w-0 items-center gap-3">
              <input type="checkbox" checked={task.done} onChange={event => setTasks(tasks.map(item => item.id === task.id ? { ...item, done: event.target.checked } : item))} />
              <span className={classNames("break-words", task.done && "text-muted line-through")}>{task.text}</span>
            </label>
            <button className="text-muted hover:text-rose-600" onClick={() => setTasks(tasks.filter(item => item.id !== task.id))}>
              <Trash2 size={17} />
            </button>
          </li>
        ))}
      </ul>
    </ToolShell>
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

function HomePage({ activeView, setActiveView, result, setResult }) {
  async function generate(payload, view) {
    setActiveView(view);
    setResult({ status: "loading", html: "", text: "", error: "", view });

    try {
      let latestText = "";
      await streamGenerateNotes(payload, text => {
        latestText = text;
        setResult({
          status: "loading",
          html: markdownToHTML(text),
          text,
          error: "",
          view
        });
      });

      setResult({
        status: "done",
        html: markdownToHTML(latestText),
        text: latestText,
        error: "",
        view
      });
    } catch (error) {
      setResult({
        status: "error",
        html: "",
        text: "",
        error: friendlyError(error),
        view
      });
    }
  }

  return (
    <>
      {activeView === "home" && <HomePanel onGenerate={generate} />}
      {activeView === "pdf" && <PdfPanel onGenerate={generate} />}
      {activeView === "video" && <VideoPanel onGenerate={generate} />}
      {activeView === "pomodoro" && <PomodoroPanel />}
      {activeView === "tasks" && <TasksPanel />}
      {activeView === "music" && <MusicPanel />}
      {["home", "pdf", "video"].includes(activeView) && <NotesResult result={result} activeView={activeView} />}
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
        <HomePage activeView={activeView} setActiveView={setActiveView} result={result} setResult={setResult} />
      ) : (
        <LecturesPage token={token} user={user} onOpenAuth={() => setAuthOpen(true)} />
      )}

      <AuthModal open={authOpen} user={user} onClose={() => setAuthOpen(false)} onAuth={persistAuth} onLogout={logout} />
    </Layout>
  );
}

export default App;
