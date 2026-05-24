import {
  Bookmark,
  Download,
  FileText,
  Headphones,
  ListChecks,
  Loader2,
  LogOut,
  Music2,
  Play,
  Plus,
  Search,
  Sparkles,
  Trash2,
  User,
  WandSparkles,
  X
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiRequest, streamGenerateNotes } from "./services/api";
import { categories, curatedLectures, views } from "./data/studyData";
import { markdownToHTML } from "./utils/markdown";

const AUTH_STORAGE_KEY = "notesgpt-auth";
const TASK_STORAGE_KEY = "notesgpt-study-tasks-react";
const GOAL_STORAGE_KEY = "notesgpt-study-goal-react";
const POMODORO_DURATIONS = {
  focus: 25 * 60,
  short: 5 * 60,
  long: 15 * 60
};

function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

function friendlyError(error) {
  const message = error?.message || "Something went wrong.";
  const lower = message.toLowerCase();

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
    return JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
  } catch (error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function Layout({ page, activeView, user, onNavigateHome, onNavigateLectures, onOpenAuth, children }) {
  return (
    <div className="mx-auto min-h-screen w-[min(1160px,calc(100%-32px))] py-4 sm:py-5">
      <header className="sticky top-3 z-30 flex min-h-17 flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-white p-2 shadow-tight">
        <button onClick={() => onNavigateHome("home")} className="inline-flex min-w-max items-center gap-3 rounded-lg px-2 py-1 text-left">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-brand text-white shadow-blue-100">
            <WandSparkles size={20} />
          </span>
          <span>
            <strong className="block text-[0.98rem] leading-tight">NotesGPT</strong>
            <small className="block text-xs text-muted">Full-stack AI study app</small>
          </span>
        </button>

        <nav className="flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-line bg-slate-50 p-1" aria-label="Primary">
          {views.map(view => (
            <button
              key={view.id}
              type="button"
              onClick={() => onNavigateHome(view.id)}
              className={classNames(
                "min-h-9 whitespace-nowrap rounded-md px-3 text-sm font-bold text-muted transition",
                page === "home" && activeView === view.id && "bg-white text-ink shadow-tight",
                !(page === "home" && activeView === view.id) && "hover:bg-white hover:text-ink"
              )}
            >
              {view.label}
            </button>
          ))}
          <button
            type="button"
            onClick={onNavigateLectures}
            className={classNames(
              "min-h-9 whitespace-nowrap rounded-md px-3 text-sm font-bold text-muted transition",
              page === "lectures" && "bg-white text-ink shadow-tight",
              page !== "lectures" && "hover:bg-white hover:text-ink"
            )}
          >
            Lectures
          </button>
        </nav>

        <button type="button" onClick={onOpenAuth} className="ghost-btn max-w-[190px] overflow-hidden">
          <User size={18} />
          <span className="truncate">{user ? user.name : "Sign in"}</span>
        </button>
      </header>

      <main className="pb-10">{children}</main>
    </div>
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
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <section className="relative w-[min(430px,100%)] rounded-lg border border-line bg-white p-6 shadow-soft">
        <button type="button" onClick={onClose} className="absolute right-3 top-3 icon-btn" title="Close">
          <X size={18} />
        </button>

        <span className="eyebrow"><User size={14} /> Account access</span>
        <h2 className="mt-3 text-2xl font-extrabold text-ink">
          {user ? "Account active" : mode === "login" ? "Log in to NotesGPT" : "Create your account"}
        </h2>
        <p className="mt-2 leading-7 text-muted">
          {user
            ? `You are signed in as ${user.name} (${user.email}).`
            : mode === "login"
              ? "Enter your email and password to continue."
              : "Add your name, email, and password to save playlists in MongoDB."}
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
                    "min-h-10 rounded-md font-bold text-muted transition",
                    mode === item && "bg-white text-blue-700 shadow-tight"
                  )}
                >
                  {item === "signup" ? "Create account" : "Log in"}
                </button>
              ))}
            </div>

            <form onSubmit={submitAuth} className="mt-4 grid gap-3">
              {mode === "signup" && (
                <input
                  className="field"
                  placeholder="Full name"
                  value={form.name}
                  onChange={event => setForm({ ...form, name: event.target.value })}
                  required
                />
              )}
              <input
                className="field"
                type="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={event => setForm({ ...form, email: event.target.value })}
                required
              />
              <input
                className="field"
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={event => setForm({ ...form, password: event.target.value })}
                minLength={6}
                required
              />
              {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
              <button className="primary-btn" disabled={loading}>
                {loading ? <Loader2 className="animate-spin" size={18} /> : <User size={18} />}
                {mode === "signup" ? "Create account" : "Log in"}
              </button>
            </form>
          </>
        )}

        {user && (
          <button type="button" onClick={onLogout} className="mt-5 ghost-btn w-full">
            <LogOut size={18} />
            Sign out
          </button>
        )}
      </section>
    </div>
  );
}

function NotesResult({ result, activeView }) {
  const visible = result.view === "home" || result.view === activeView;

  if (!visible) {
    return null;
  }

  return (
    <section className="section-panel mt-5 min-h-80" aria-live="polite">
      {result.status === "idle" && (
        <div className="grid min-h-72 place-items-center text-center">
          <div>
            <FileText className="mx-auto text-blue-600" size={34} />
            <h3 className="mt-3 text-lg font-extrabold">Your generated notes will appear here.</h3>
            <p className="mt-2 text-muted">Choose a tool or write a prompt.</p>
          </div>
        </div>
      )}

      {result.status === "loading" && (
        <div className="mx-auto grid max-w-2xl gap-5 rounded-lg border border-line bg-white p-6 shadow-soft">
          <div className="flex items-center gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-lg bg-brand text-white">
              <WandSparkles size={20} />
            </span>
            <div>
              <strong className="block">NotesGPT is writing</strong>
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
        <div className="grid min-h-72 place-items-center text-center text-rose-600">
          <p className="font-bold">{result.error}</p>
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
      <section className="py-8 text-center sm:py-11">
        <span className="eyebrow justify-center"><Sparkles size={15} /> Gemini powered study notes</span>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-black leading-tight text-ink sm:text-5xl">
          Generate clean notes from one prompt.
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg leading-8 text-muted">
          Ask for any topic and get structured notes with definitions, examples, exam points, and glossary-style clarity.
        </p>

        <form onSubmit={submit} className="panel mx-auto mt-7 max-w-4xl p-4 text-left shadow-soft">
          <textarea
            className="textarea-field border-0 bg-white text-base focus:ring-0"
            rows={4}
            placeholder="Ask anything: DBMS normalization, Java OOP, OS deadlocks..."
            value={form.prompt}
            onChange={event => setForm({ ...form, prompt: event.target.value })}
            required
          />
          <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="grid gap-1 text-sm font-bold text-slate-700">
                Category
                <select className="field" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
                  {["General", "DBMS", "Operating System", "Data Structures", "Artificial Intelligence", "Java", "Web Development"].map(item => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">
                Language
                <select className="field" value={form.language} onChange={event => setForm({ ...form, language: event.target.value })}>
                  <option>English</option>
                  <option>Hindi</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-bold text-slate-700">
                Depth
                <select className="field" value={form.depth} onChange={event => setForm({ ...form, depth: event.target.value })}>
                  <option value="exam revision">Exam revision</option>
                  <option value="detailed classroom notes">Detailed notes</option>
                  <option value="quick short notes">Short notes</option>
                </select>
              </label>
            </div>
            <button className="primary-btn">
              <Sparkles size={18} />
              Generate
            </button>
          </div>
        </form>
      </section>

      <section className="section-panel">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow"><ListChecks size={15} /> Popular categories</span>
            <h2 className="mt-2 text-2xl font-extrabold">Start with a study category</h2>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {categories.map(item => {
            const Icon = item.icon;
            return (
              <button key={item.title} type="button" onClick={() => useCategory(item)} className="min-h-34 rounded-lg border border-line bg-white p-4 text-left shadow-tight transition hover:border-blue-300 hover:bg-blue-50">
                <Icon className="text-blue-600" size={22} />
                <span className="mt-3 block text-xs font-extrabold uppercase text-slate-600">{item.category}</span>
                <strong className="mt-1 block text-[1.02rem]">{item.title}</strong>
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
    <ToolShell eyebrow="PDF summary" title="Summarize study PDFs" description="Upload notes, chapters, or handouts and turn them into structured revision points.">
      <label className="grid min-h-12 cursor-pointer place-items-center rounded-lg border border-dashed border-blue-300 bg-blue-50 px-4 py-5 text-center font-bold text-blue-700">
        <input className="hidden" type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
        {file ? file.name : "Choose a PDF file"}
      </label>
      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
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
    <ToolShell eyebrow="Video summary" title="Summarize YouTube lectures" description="Paste a lecture link and optional transcript or timestamps to generate clean study notes.">
      <input className="field" type="url" placeholder="Paste YouTube lecture link" value={url} onChange={event => setUrl(event.target.value)} />
      <textarea className="textarea-field" rows={4} placeholder="Paste transcript or timestamps (optional)" value={extraNotes} onChange={event => setExtraNotes(event.target.value)} />
      {error && <p className="text-sm font-semibold text-rose-600">{error}</p>}
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

  function changeMode(nextMode) {
    setMode(nextMode);
    setRunning(false);
    setRemaining(POMODORO_DURATIONS[nextMode]);
  }

  const minutes = String(Math.floor(remaining / 60)).padStart(2, "0");
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <ToolShell eyebrow="Pomodoro" title="Run focused study sprints" description="Use focus and break modes to study with a simple Pomodoro timer.">
      <div className="text-5xl font-black text-ink">{minutes}:{seconds}</div>
      <div className="grid grid-cols-3 gap-2">
        {["focus", "short", "long"].map(item => (
          <button key={item} type="button" onClick={() => changeMode(item)} className={classNames("min-h-10 rounded-lg border border-line bg-slate-50 font-bold capitalize", mode === item && "border-blue-300 bg-blue-50 text-blue-700")}>
            {item === "short" ? "Break" : item}
          </button>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="primary-btn" onClick={() => setRunning(value => !value)}>
          <Play size={18} />
          {running ? "Pause" : "Start"}
        </button>
        <button className="ghost-btn" onClick={() => changeMode(mode)}>Reset</button>
      </div>
    </ToolShell>
  );
}

function TasksPanel() {
  const [goal, setGoal] = useState(() => localStorage.getItem(GOAL_STORAGE_KEY) || "");
  const [taskText, setTaskText] = useState("");
  const [tasks, setTasks] = useState(() => {
    try {
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

  return (
    <ToolShell eyebrow="Tasks" title="Plan goals and tasks" description="Set today's goal, add study tasks, and mark them complete as you work.">
      <input className="field" placeholder="Today's study goal" value={goal} onChange={event => setGoal(event.target.value)} />
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input className="field" placeholder="Add task" value={taskText} onChange={event => setTaskText(event.target.value)} onKeyDown={event => event.key === "Enter" && addTask()} />
        <button className="primary-btn" onClick={addTask}><Plus size={18} /> Add</button>
      </div>
      <ul className="grid max-h-72 gap-2 overflow-auto">
        {!tasks.length && <li className="rounded-lg border border-line bg-slate-50 p-3 text-muted">No tasks yet.</li>}
        {tasks.map(task => (
          <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-slate-50 p-3">
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

  function stopSound() {
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
    setPlaying(false);
  }

  function startSound() {
    stopSound();
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

  useEffect(() => () => stopSound(), []);

  return (
    <ToolShell eyebrow="Focus music" title="Play ambient study sound" description="Choose a sound profile and keep it low while you read, revise, or code.">
      <select className="field" value={sound} onChange={event => setSound(event.target.value)}>
        <option value="rain">Soft rain</option>
        <option value="deep">Deep focus</option>
        <option value="white">White noise</option>
      </select>
      <label className="grid gap-2 text-sm font-bold text-slate-700">
        Volume
        <input type="range" min="0" max="100" value={volume} onChange={event => setVolume(Number(event.target.value))} />
      </label>
      <button className="primary-btn" onClick={playing ? stopSound : startSound}>
        {playing ? <Music2 size={18} /> : <Headphones size={18} />}
        {playing ? "Stop Focus" : "Play Focus"}
      </button>
    </ToolShell>
  );
}

function ToolShell({ eyebrow, title, description, children }) {
  return (
    <section className="section-panel mt-7 grid gap-5 lg:grid-cols-[0.82fr_1.18fr]">
      <div>
        <span className="eyebrow"><Sparkles size={15} /> {eyebrow}</span>
        <h2 className="mt-2 text-3xl font-extrabold text-ink">{title}</h2>
        <p className="mt-3 max-w-md leading-7 text-muted">{description}</p>
      </div>
      <article className="grid gap-4 rounded-lg border border-line bg-slate-50 p-5">
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
      <NotesResult result={result} activeView={activeView} />
    </>
  );
}

function LectureCard({ lecture, custom, onDelete }) {
  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white shadow-tight">
      <a href={lecture.url} target="_blank" rel="noreferrer" className="relative block aspect-video overflow-hidden bg-slate-100">
        <img src={lecture.thumbnail || "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80"} alt={`${lecture.title} thumbnail`} className="h-full w-full object-cover transition hover:scale-105" />
        <span className="absolute bottom-3 right-3 grid h-10 w-10 place-items-center rounded-full bg-white text-blue-700 shadow-soft">
          <Play size={18} />
        </span>
      </a>
      <div className="grid min-h-52 gap-2 p-4">
        <span className="text-xs font-extrabold uppercase text-slate-600">{lecture.label || lecture.category}</span>
        <h2 className="text-lg font-extrabold text-ink">{lecture.title}</h2>
        <p className="leading-7 text-muted">{lecture.description || lecture.notes || "Saved personal playlist."}</p>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <a href={lecture.url} target="_blank" rel="noreferrer" className="font-bold text-blue-700">Open Playlist</a>
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
      <section className="mt-7 grid gap-5 rounded-lg border border-line bg-white p-5 shadow-tight lg:grid-cols-[1fr_360px] lg:items-center">
        <div>
          <span className="eyebrow"><Play size={15} /> Curated lectures</span>
          <h1 className="mt-2 text-4xl font-black text-ink">Watch lectures with thumbnails.</h1>
          <p className="mt-3 leading-7 text-muted">Search by topic, open curated lectures, or save your own MongoDB-backed playlists.</p>
        </div>
        <label className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input className="field pl-10" type="search" placeholder="Search lectures, creators, or subjects" value={query} onChange={event => setQuery(event.target.value)} />
        </label>
      </section>

      <div className="mt-4 flex flex-wrap gap-2">
        {["all", "programming", "web", "dsa", "cs"].map(item => (
          <button key={item} className={classNames("min-h-10 rounded-lg border border-line bg-white px-3 font-bold capitalize", filter === item && "border-blue-300 bg-blue-50 text-blue-700")} onClick={() => setFilter(item)}>
            {item === "cs" ? "CS Core" : item}
          </button>
        ))}
      </div>

      <section className="section-panel mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="eyebrow"><Bookmark size={15} /> Your playlists</span>
            <h2 className="mt-2 text-2xl font-extrabold">Create your own playlist</h2>
          </div>
          <span className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700">
            {user ? user.name : "Sign in required"}
          </span>
        </div>

        <form onSubmit={addPlaylist} className="mt-5 grid gap-3 lg:grid-cols-[1fr_1.3fr_140px_1fr_auto]">
          <input className="field" placeholder="Playlist title" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} required />
          <input className="field" placeholder="YouTube playlist or video link" value={form.url} onChange={event => setForm({ ...form, url: event.target.value })} required />
          <select className="field" value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}>
            <option value="programming">Programming</option>
            <option value="web">Web</option>
            <option value="dsa">DSA</option>
            <option value="cs">CS Core</option>
            <option value="custom">Custom</option>
          </select>
          <input className="field" placeholder="Short note or topic" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} />
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
