"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Camera, Check, Copy, FileText, Mic, Square, X, Volume2, VolumeX } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AdvisorError, askAdvisor, transcribeVoice, type Source, type Visualization } from "./advisor";

type ImageAttachment = { name: string; url: string; file: File };
type Msg = { id: number; role: "user" | "bot"; text: string; sources?: Source[]; files?: string[]; imageFiles?: ImageAttachment[]; pipeline?: string[]; model?: string; visualization?: Visualization; followUps?: string[]; fileNotes?: string[]; createdAt?: string };
type Presence = "off" | "typing" | "recent";
type AuthStudent = { id: string; username: string; name: string; synthetic_student_id: string; programme: string; admission_batch: string; current_semester: number | null; academic_status: string; synthetic_cgpa: number | null };
type DemoAccountOption = { username: string; profileId: string; name: string; persona: string; programme: string; currentSemester: number | null; academicStatus: string };

function splitPipeCells(value: string) {
  return value.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}

function repairFlattenedMarkdownTables(value: string) {
  const lines = value.split("\n");
  for (let dividerLine = 0; dividerLine < lines.length; dividerLine += 1) {
    const divider = /(?:\|\s*:?-{3,}:?\s*){2,}\|?/.exec(lines[dividerLine]);
    if (!divider) continue;

    let headerStart = dividerLine;
    while (headerStart > 0 && lines[headerStart - 1].trim() && lines[headerStart - 1].includes("|")) {
      headerStart -= 1;
    }
    const headerText = lines.slice(headerStart, dividerLine).join(" ") + " " + lines[dividerLine].slice(0, divider.index);
    const headers = headerText.split("|").map((cell) => cell.trim()).filter(Boolean);
    const columnCount = (divider[0].match(/:?-{3,}:?/g) || []).length;
    if (columnCount < 2 || headers.length !== columnCount) continue;

    const bodyParts = [lines[dividerLine].slice(divider.index + divider[0].length)];
    let bodyEnd = dividerLine + 1;
    while (bodyEnd < lines.length && lines[bodyEnd].trim() && lines[bodyEnd].includes("|")) {
      bodyParts.push(lines[bodyEnd]);
      bodyEnd += 1;
    }
    const body = bodyParts.join(" ").trim();
    if (!body.startsWith("|") || !/\|\s*\|\s*\|/.test(body)) continue;

    const flattenedRows = body.split(/\|\s*\|\s*\|/);
    const rows: string[][] = [];
    let valid = true;
    for (let rowIndex = 0; rowIndex < flattenedRows.length; rowIndex += 1) {
      const fragment = flattenedRows[rowIndex].trim();
      if (!fragment) continue;
      const cells = splitPipeCells(fragment);
      if (cells.length === columnCount - 1 && rowIndex > 0) cells.unshift("");
      if (cells.length !== columnCount) { valid = false; break; }
      rows.push(cells);
    }
    if (!valid || rows.length === 0) continue;

    const table = [
      "| " + headers.join(" | ") + " |",
      "| " + headers.map(() => "---").join(" | ") + " |",
      ...rows.map((cells) => "| " + cells.join(" | ") + " |"),
    ].join("\n");
    return [...lines.slice(0, headerStart), table, ...lines.slice(bodyEnd)].join("\n");
  }
  return value;
}

function normalizeAnswerMarkdown(input: string) {
  let markdown = String(input || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\\+[ \t]*(?=\n)/g, "")
    .replace(/\\\*\\\*/g, "**")
    .replace(/\\\*/g, "*")
    .replace(/\\_/g, "_")
    .replace(/\\+\|/g, "|")
    .replace(/\\?<br\s*\/?>/gi, " / ")
    .replace(/<br\s*\/?>/gi, " / ")
    .replace(/^\s*Sources consulted\s*:\s*.*$/gim, "")
    .replace(/!\[[^\]]*\]\(\s*https?:\/\/[^)]*\)/gi, "")
    .replace(/\[(?:image|svg)\]\(\s*https?:\/\/[^)]*\)/gi, "")
    .replace(/\[[^\]]*\]\(\s*https?:\/\/[^\s)]*\.(?:png|jpe?g|gif|webp|svg)(?:[?#][^)]*)?\)/gi, "")
    .replace(/^\s*svg\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Normalize escaped table delimiters before GFM sees the Markdown.
  markdown = markdown.replace(/^(\s*)\\?\|/gm, "$1|");
  markdown = repairFlattenedMarkdownTables(markdown);
  return markdown;
}
function compactSources(sources: Source[]): Source[] {
  const groups = new Map<string, { title: string; url: string; pages: Set<number> }>();
  for (const source of sources) {
    const url = String(source.url || "");
    const canonicalUrl = url.replace(/#.*$/, "");
    const key = canonicalUrl || source.title;
    const pageMatch = source.title.match(/·\s*p\.\s*(\d+)/i);
    const pageNumber = pageMatch ? Number(pageMatch[1]) : undefined;
    const baseTitle = source.title
      .replace(/\s*·\s*p\.\s*\d+/i, "")
      .replace(/\s*·\s*[^·]+$/, "")
      .replace(/\s+—\s+.+$/, "")
      .trim();
    const existing = groups.get(key);
    if (existing) {
      if (pageNumber) existing.pages.add(pageNumber);
    } else {
      groups.set(key, {
        title: baseTitle || source.title,
        url,
        pages: new Set(pageNumber ? [pageNumber] : []),
      });
    }
  }
  return Array.from(groups.values()).slice(0, 8).map((group) => {
    const pages = Array.from(group.pages).sort((a, b) => a - b);
    return {
      title: group.title + (pages.length ? " · pp. " + pages.join(", ") : ""),
      url: group.url,
    };
  });
}

function renderAnswer(text: string) {
  return (
    <div className="answer-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            const safeHttp = /^https?:\/\//i.test(href || "");
            const safeSameOriginPath = Boolean(href && href.startsWith("/") && !href.startsWith("//"));
            if (!href || (!safeHttp && !safeSameOriginPath)) return <span>{children}</span>;
            // Never render model-supplied links as avatar/infographic images.
            if (/\.(?:png|jpe?g|gif|webp|svg)(?:[?#].*)?$/i.test(href)) return null;
            // Marksheet/PDF download — fetch with credentials so the auth cookie is sent,
            // then trigger a blob download rather than opening a tab (which would lose the cookie).
            if (href.startsWith("/api/marksheet")) {
              return (
                <button
                  className="btn-download-marksheet"
                  onClick={async () => {
                    try {
                      const res = await fetch(href, { credentials: "include" });
                      if (!res.ok) { alert("Could not generate marksheet. Please make sure you are logged in."); return; }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = "synthetic-marksheet.pdf";
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    } catch { alert("Download failed. Please try again."); }
                  }}
                >
                  ⬇ {children}
                </button>
              );
            }
            return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          img: () => null,
          table: ({ children }) => (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
        }}
      >
        {normalizeAnswerMarkdown(text)}
      </ReactMarkdown>
    </div>
  );
}

function renderVisualization(visual?: Visualization) {
  if (!visual) return null;
  if (visual.kind === "course-pathway" && visual.pathway) {
    const prerequisites = visual.pathway.prerequisites;
    const height = Math.max(190, prerequisites.length * 88 + 48);
    const targetCenter = height / 2;
    const statusLabel = (status: string) => status === "completed" ? "PASSED" : status === "failed" ? "FAILED" : status === "not-required" ? "NOT REQUIRED" : "UNKNOWN";
    const statusColor = (status: string) => status === "completed" ? "#24734d" : status === "failed" ? "#b4232c" : status === "not-required" ? "#53627f" : "#8a641c";
    const wrapLabel = (value: string, limit = 34) => {
      const words = value.split(/\s+/);
      const lines: string[] = [];
      let line = "";
      words.forEach((word) => {
        if (line && (line + " " + word).length > limit) { lines.push(line); line = word; }
        else line = line ? line + " " + word : word;
      });
      if (line) lines.push(line);
      return lines.slice(0, 2);
    };
    return (
      <section className="visual-card pathway-visual" aria-label={visual.title}>
        <h3>{visual.title}</h3>
        <svg viewBox={`0 0 740 ${height}`} role="img" aria-label={`Prerequisite pathway for ${visual.pathway.target.code} ${visual.pathway.target.title}. ${prerequisites.map((item) => item.code + " " + statusLabel(item.status)).join("; ")}. Eligibility: ${visual.pathway.eligibility.replace(/_/g, " ")}.`} className="pathway-svg">
          <defs><marker id="course-pathway-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="#8795b5" /></marker></defs>
          {prerequisites.map((item, index) => {
            const y = 20 + index * 88;
            const center = y + 31;
            const lines = wrapLabel(item.title);
            return (
              <g key={item.code + "-" + index}>
                <path d={`M 325 ${center} C 365 ${center}, 382 ${targetCenter}, 425 ${targetCenter}`} fill="none" stroke="#8795b5" strokeWidth="2" markerEnd="url(#course-pathway-arrow)" />
                <rect x="24" y={y} width="301" height="62" rx="9" fill="#ffffff" stroke={statusColor(item.status)} strokeWidth="1.5" />
                <text x="38" y={y + 19} fill="#1d2b56" fontSize="12" fontWeight="700">{item.code}</text>
                <text x="38" y={y + 36} fill="#343b55" fontSize="11">{lines[0] || item.title}</text>
                {lines[1] && <text x="38" y={y + 49} fill="#343b55" fontSize="11">{lines[1]}</text>}
                <text x="312" y={y + 15} textAnchor="end" fill={statusColor(item.status)} fontSize="9" fontWeight="700">{statusLabel(item.status)}</text>
              </g>
            );
          })}
          <rect x="425" y={targetCenter - 43} width="290" height="86" rx="11" fill="#eef2fb" stroke="#253f86" strokeWidth="2" />
          <text x="444" y={targetCenter - 14} fill="#1d2b56" fontSize="13" fontWeight="700">{visual.pathway.target.code}</text>
          <text x="444" y={targetCenter + 7} fill="#30384e" fontSize="12">{wrapLabel(visual.pathway.target.title)[0]}</text>
          <text x="444" y={targetCenter + 25} fill="#53627f" fontSize="10" fontWeight="700">TARGET COURSE</text>
        </svg>
        <div className="pathway-legend" aria-label="Prerequisite status legend">
          <span><i className="passed" /> Passed</span><span><i className="failed" /> Failed</span><span><i className="unknown" /> Not established</span>
        </div>
        <p className="visual-note">Based on the signed-in synthetic profile and the matching admission-batch workbook row. This checks direct prerequisites only; it is not registration approval.</p>
      </section>
    );
  }
  const max = Math.max(1, ...visual.items.map((item) => item.value ?? 0));
  return (
    <section className="visual-card" aria-label={"Visual summary: " + visual.title}>
      <h3>{visual.title}</h3>
      {visual.items.map((item, index) => (
        <div className={"visual-item " + visual.kind} key={item.label + "-" + index}>
          <div className="visual-item-heading">
            <strong>{item.label}</strong>
            {item.valueLabel && <span>{item.valueLabel}</span>}
            {item.value !== undefined && !item.valueLabel && <span>{item.value.toLocaleString()}</span>}
          </div>
          {visual.kind === "bars" && item.value !== undefined && (
            <div className="visual-track" aria-hidden="true">
              <span style={{ width: (Math.max(0, Math.min(100, item.value / max * 100))) + "%" }} />
            </div>
          )}
          {item.detail && <p>{item.detail}</p>}
        </div>
      ))}
      <p className="visual-note">Visual summary generated from the cited response. Verify the underlying source before relying on it.</p>
    </section>
  );
}

const GREETING =
  "Hi! I’m **Vikki Talk** 👋\n\nYour academic assistant for B.Tech at Vidyashilp University. I can help you with courses, prerequisites, credits, backlogs, eligibility, and academic progression.";
const CHIPS = ["What courses did I have in Semester 1?", "How many credits have I completed?", "Can I take COMP302?"];
const MAX_MB = 4;
const MAX_FILES = 4;
const isImageFile = (file: File) => file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|bmp|tiff?)$/i.test(file.name);
const IDLE_MS = 5000; // green ring / dot disappear after 5 seconds of inactivity

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([{ id: 0, role: "bot", text: GREETING }]);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [presence, setPresence] = useState<Presence>("off");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [attachmentContext, setAttachmentContext] = useState<string[]>([]);
  const [pendingImageUrls, setPendingImageUrls] = useState<Map<File, string>>(new Map());
  const [notice, setNotice] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [speakingId, setSpeakingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedImageKey, setCopiedImageKey] = useState<string | null>(null);
  const [program, setProgram] = useState("Not specified");
  const [semester, setSemester] = useState("Not specified");
  const [credits, setCredits] = useState("");
  const [cgpa, setCgpa] = useState("");
  const [syntheticStudentId, setSyntheticStudentId] = useState("");
  const [authStudent, setAuthStudent] = useState<AuthStudent | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [demoAccountOptions, setDemoAccountOptions] = useState<DemoAccountOption[]>([]);

  const idRef = useRef(1);
  const endRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chatAbortRef = useRef<AbortController | null>(null);
  const sessionEpochRef = useRef(0);
  const discardRecordingRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (window.innerWidth < 860) setSidebarOpen(false);
    return () => {
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (tickRef.current) clearInterval(tickRef.current);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []); 
  useEffect(() => {
    let active = true;
    fetch("/api/auth/demo-profiles", { cache: "no-store" })
      .then(async (response) => { const data = await response.json().catch(() => ({})) as { profiles?: DemoAccountOption[] }; if (active && response.ok) setDemoAccountOptions(data.profiles || []); })
      .catch(() => { if (active) setLoginError("Could not load the synthetic scenario list."); });
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({})) as { student?: AuthStudent | null };
        if (!active) return;
        if (response.ok && data.student) {
          const student = data.student;
          setAuthStudent(student);
          setLoginUsername(student.username);
          setProgram(student.programme);
          setSemester(student.current_semester === null ? "Graduated" : String(student.current_semester));
          setCgpa(student.synthetic_cgpa === null ? "" : String(student.synthetic_cgpa));
          setSyntheticStudentId(student.id);
        }
      })
      .catch(() => { if (active) setLoginError("Could not check the demo session. Please try again."); })
      .finally(() => { if (active) setAuthReady(true); });
    return () => { active = false; };
  }, []);

  const syncSessionRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    // The session cookie is shared by every tab. Re-check it when this tab regains
    // focus so a login/logout elsewhere cannot leave this tab showing (or sending
    // requests as) a different student.
    if (!authStudent) { syncSessionRef.current = async () => {}; return; }
    const shownId = authStudent.id;
    const sync = async () => {
      try {
        const response = await fetch("/api/auth/session", { cache: "no-store" });
        const data = await response.json().catch(() => ({})) as { student?: AuthStudent | null };
        if (response.ok && data.student && data.student.id === shownId) return;
        cancelPendingWork();
        setMessages([{ id: idRef.current++, role: "bot", text: GREETING }]);
        setAttachments([]);
        setAttachmentContext([]);
        if (response.ok && data.student) {
          const student = data.student;
          setAuthStudent(student);
          setLoginUsername(student.username);
          setProgram(student.programme);
          setSemester(student.current_semester === null ? "Graduated" : String(student.current_semester));
          setCgpa(student.synthetic_cgpa === null ? "" : String(student.synthetic_cgpa));
          setCredits("");
          setSyntheticStudentId(student.id);
          setNotice("This tab was refreshed because you signed in as " + student.name + " in another tab or window.");
        } else {
          setAuthStudent(null);
          setLoginError("Your session ended. Please sign in again.");
        }
      } catch { /* offline: keep the current view; the server still rejects mismatched requests */ }
    };
    syncSessionRef.current = sync;
    const onVisible = () => { if (document.visibilityState === "visible") void sync(); };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.removeEventListener("focus", sync); document.removeEventListener("visibilitychange", onVisible); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStudent?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);
  useEffect(() => {
    const urls = new Map<File, string>();
    attachments.forEach((file) => {
      if (file.type.startsWith("image/") || /\.(?:png|jpe?g|webp|bmp|tiff?)$/i.test(file.name)) urls.set(file, URL.createObjectURL(file));
    });
    setPendingImageUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [attachments]);

  function startTyping() {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setPresence("typing");
  }
  function finishTyping() {
    setPresence("recent");
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setPresence("off"), IDLE_MS);
  }

  function addFileItems(incoming: File[]) {
    const ok: File[] = [];
    incoming.forEach((file) => {
      if (file.size > MAX_MB * 1024 * 1024) {
        setNotice(file.name + " is larger than 4 MB and was not attached.");
      } else {
        ok.push(file);
      }
    });
    if (ok.length) {
      setAttachments((current) => {
        const combined = [...current, ...ok];
        const total = combined.reduce((sum, file) => sum + file.size, 0);
        if (combined.length > MAX_FILES) {
          setNotice("You can attach up to 4 files per message.");
          return current;
        }
        if (total > MAX_MB * 1024 * 1024) {
          setNotice("Attachments exceed the 4 MB total limit. Remove a file and try again.");
          return current;
        }
        setNotice("");
        return combined;
      });
    }
  }

  function addFiles(list: FileList | null) {
    if (list) addFileItems(Array.from(list));
  }

  async function toggleMic() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setNotice("Voice recording is not supported in this browser.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      const epoch = sessionEpochRef.current;
      discardRecordingRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        if (tickRef.current) clearInterval(tickRef.current);
        if (discardRecordingRef.current || epoch !== sessionEpochRef.current) { setRecording(false); return; }
        const type = rec.mimeType || "audio/webm";
        const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
        const recordingFile = new File(chunks, "voice-note." + ext, { type });
        setRecording(false);
        if (recordingFile.size === 0) {
          setNotice("No audio was captured. Please try recording again.");
          return;
        }
        if (recordingFile.size > MAX_MB * 1024 * 1024) {
          setNotice("This recording is larger than 4 MB. Please record a shorter message.");
          return;
        }
        setTranscribing(true);
        setNotice("Transcribing your recording…");
        try {
          const transcript = await transcribeVoice(recordingFile, authStudent?.id);
          if (epoch !== sessionEpochRef.current) return; // session changed while transcribing
          if (!transcript) {
            setNotice("No speech could be recognised. Try speaking more clearly or recording again.");
            return;
          }
          const draft = draftRef.current;
          if (draft) {
            const existing = draft.value.trim();
            draft.value = existing ? existing + "\n" + transcript : transcript;
            draft.style.height = "auto";
            draft.style.height = Math.min(draft.scrollHeight, 120) + "px";
            draft.focus();
          }
          setNotice("");
        } catch (error) {
          setNotice(error instanceof Error ? error.message : "Voice transcription failed. Please try again.");
        } finally {
          setTranscribing(false);
        }
      };
      rec.start();
      recRef.current = rec;
      setSeconds(0);
      setRecording(true);
      setNotice("");
      tickRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setRecording(false);
      setNotice("Allow microphone access in your browser to record a message.");
    }
  }

  async function send(text?: string) {
    const typed = (text ?? draftRef.current?.value ?? "").trim();
    if ((!typed && attachments.length === 0) || busy || recording || transcribing) return;
    const question = typed || "Please look at my attachment.";
    const normalizedQuestion = question.toLowerCase();
    const identityQuestion = /\b(?:who\s+(?:am\s+i|a\s+i)|what\s+is\s+my\s+name|my\s+name|my\s+user\s+id|who\s+is\s+logged\s+in|which\s+profile)\b/.test(normalizedQuestion);
    const marksheetQuestion = /\b(marksheet|mark sheet|transcript)\b/.test(normalizedQuestion) && /\b(download|get|generate|give|show|need|want|provide|my)\b/.test(normalizedQuestion);
    if (identityQuestion && authStudent) {
      setMessages((current) => [...current, { id: idRef.current++, role: "user", text: question }, { id: idRef.current++, role: "bot", text: "You are **" + authStudent.name + "**. Your User ID is **" + authStudent.username + "** (synthetic profile: " + authStudent.synthetic_student_id + ")." }]);
      if (draftRef.current) { draftRef.current.value = ""; draftRef.current.style.height = ""; }
      setNotice("");
      return;
    }
    if (/\b(?:i\s+)?(?:dont|don't|do not)\s+see\s+(?:the\s+)?(?:download\s+)?button|(?:download\s+)?button\s+(?:is\s+)?not\s+(?:visible|showing)/i.test(normalizedQuestion) && /\b(?:marksheet|mark\s*sheet|transcript|download)\b/i.test(normalizedQuestion)) {
      setMessages((current) => [...current, { id: idRef.current++, role: "user", text: question }, { id: idRef.current++, role: "bot", text: "Here is the direct link to your synthetic marksheet PDF: [Download Synthetic Marksheet PDF](/api/marksheet). If it does not start downloading, open the link in a new tab. This PDF is generated from your signed-in fictional demo profile." }]);
      if (draftRef.current) { draftRef.current.value = ""; draftRef.current.style.height = ""; }
      setNotice("");
      return;
    }
    if (marksheetQuestion) {
      const semesterMatch = normalizedQuestion.match(/\b(?:semester|sem)\s*(\d{1,2})\b|\b(\d{1,2})(?:st|nd|rd|th)\s+semester\b/);
      const semester = semesterMatch ? Number(semesterMatch[1] || semesterMatch[2]) : undefined;
      const downloadUrl = semester && semester >= 1 && semester <= 10 ? "/api/marksheet?semester=" + semester : "/api/marksheet";
      const label = semester ? "Download Synthetic Marksheet PDF — Semester " + semester : "Download Synthetic Marksheet PDF";
      setMessages((current) => [...current, { id: idRef.current++, role: "user", text: question }, { id: idRef.current++, role: "bot", text: "Your synthetic academic record PDF is ready: [" + label + "](" + downloadUrl + ")." }]);
      if (draftRef.current) { draftRef.current.value = ""; draftRef.current.style.height = ""; }
      setNotice("");
      return;
    }
    const files = attachments;
    const imageFiles: ImageAttachment[] = files
      .filter(isImageFile)
      .map((file) => ({ name: file.name, url: URL.createObjectURL(file), file }));
    const history = messages
      .slice(-8)
      .map((m) => ({ role: m.role === "bot" ? ("assistant" as const) : ("user" as const), text: m.text }));
    setMessages((m) => [...m, { id: idRef.current++, role: "user", text: question, files: files.map((f) => f.name), imageFiles }]);
    if (draftRef.current) { draftRef.current.value = ""; draftRef.current.style.height = ""; }
    setAttachments([]);
    setNotice("");
    setBusy(true);
    startTyping();
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const epoch = sessionEpochRef.current;
    try {
      const r = await askAdvisor({
        question,
        history,
        profile: { program, semester, completedCredits: credits, cgpa, syntheticStudentId },
        files,
        attachmentContext,
        expectedProfileId: authStudent?.id,
        signal: controller.signal,
      });
      // Drop late responses that belong to a previous session or cleared chat.
      if (controller.signal.aborted || epoch !== sessionEpochRef.current) return;
      setAttachmentContext(r.attachmentContext ?? attachmentContext);
      setMessages((m) => [...m, { id: idRef.current++, role: "bot", text: r.answer, ...r, createdAt: new Date().toISOString() }]);
    } catch (error) {
      if (controller.signal.aborted || epoch !== sessionEpochRef.current) return;
      const detail = error instanceof Error ? error.message : "Unknown request error";
      if (error instanceof AdvisorError && error.code === "SESSION_CHANGED") void syncSessionRef.current();
      if (typed && draftRef.current && !draftRef.current.value.trim()) {
        draftRef.current.value = typed;
        draftRef.current.style.height = "auto";
        draftRef.current.style.height = Math.min(draftRef.current.scrollHeight, 120) + "px";
      }
      if (files.length) {
        setAttachments((current) => {
          const restored = [...files, ...current.filter((file) => !files.includes(file))];
          const total = restored.reduce((sum, file) => sum + file.size, 0);
          if (total <= MAX_MB * 1024 * 1024) {
            setNotice("The request failed. Your attachments have been restored so you can retry.");
            return restored;
          }
          setNotice("The request failed. New attachments were kept, but the earlier files could not all be restored because they exceed the 4 MB limit.");
          return current;
        });
      }
      setMessages((m) => [
        ...m,
        { id: idRef.current++, role: "bot", text: "The advisor request failed: " + detail },
      ]);
    } finally {
      setBusy(false);
      finishTyping();
    }
  }

  function toggleSpeech(id: number, text: string) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setNotice("Text-to-speech is not supported in this browser.");
      return;
    }
    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  }

  async function copyAnswer(id: number, text: string) {
    try {
      await navigator.clipboard.writeText(normalizeAnswerMarkdown(text));
      setCopiedId(id);
    } catch {
      setNotice("Clipboard access is unavailable. Check your browser permissions and try again.");
    }
  }

  async function copyImage(messageId: number, image: ImageAttachment) {
    const imageKey = `${messageId}:${image.name}`;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("This browser does not support copying images directly. You can right-click the preview and choose Copy image.");
      }
      // Call clipboard.write during the click gesture; resolve the image conversion as promised data.
      const pngPromise: Promise<Blob> = image.file.type === "image/png"
        ? Promise.resolve(image.file)
        : (async () => {
            const bitmap = await createImageBitmap(image.file);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            const context = canvas.getContext("2d");
            if (!context) {
              bitmap.close();
              throw new Error("The image could not be prepared for copying.");
            }
            context.drawImage(bitmap, 0, 0);
            bitmap.close();
            return new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("The image could not be converted for copying.")), "image/png");
            });
          })();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngPromise })]);
      setCopiedImageKey(imageKey);
      setNotice("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "The image could not be copied. Check clipboard permissions and try again.");
    }
  }

  function cancelPendingWork() {
    sessionEpochRef.current += 1;
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") {
      discardRecordingRef.current = true;
      recRef.current.stop();
    }
    if (tickRef.current) clearInterval(tickRef.current);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeakingId(null);
    setRecording(false);
    setTranscribing(false);
    setBusy(false);
  }

  function clearChat() {
    cancelPendingWork();
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    messages.forEach((message) => message.imageFiles?.forEach((image) => URL.revokeObjectURL(image.url)));
    setSpeakingId(null);
    setCopiedImageKey(null);
    setCopiedId(null);
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setPresence("off");
    setMessages([{ id: idRef.current++, role: "bot", text: GREETING }]);
    setAttachments([]);
    setAttachmentContext([]);
    setNotice("");
  }

  if (!authReady) {
    return <div className="login-shell"><div className="login-card"><img src="/logo.png" alt="Vidyashilp University" /><p>Loading synthetic demo account…</p></div></div>;
  }
  if (!authStudent) {
    return (
      <div className="login-shell">
        <div className="login-card">
          <img src="/logo.png" alt="Vidyashilp University" />
          <h1>Vikki Talk</h1>
          <p className="brand-byline">by Vidyashilp University</p>
          <h2>{authMode === "login" ? "Student account login" : "Synthetic demo signup"}</h2>
          <p>This advisor is restricted to B.Tech. All student accounts and academic records are fictional Assignment 2 scenarios, not VU/Digiicampus accounts.</p>
          <div className="login-tabs" role="tablist" aria-label="Account access">
            <button type="button" className={authMode === "login" ? "login-tab active" : "login-tab"} onClick={() => { setAuthMode("login"); setLoginError(""); }}>Log in</button>
            <button type="button" className={authMode === "signup" ? "login-tab active" : "login-tab"} onClick={() => { setAuthMode("signup"); setLoginError(""); if (!loginUsername && demoAccountOptions[0]) setLoginUsername(demoAccountOptions[0].username); }}>Sign up</button>
          </div>
          <form onSubmit={async (event) => {
            event.preventDefault();
            setLoginBusy(true);
            setLoginError("");
            try {
              const endpoint = authMode === "signup" ? "/api/auth/signup" : "/api/auth/login";
              const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginUsername, password: loginPassword }), cache: "no-store" });
              const data = await response.json().catch(() => ({})) as { student?: AuthStudent; error?: string };
              if (!response.ok || !data.student) throw new Error(data.error || (authMode === "signup" ? "Demo signup failed." : "Login failed."));
              const student = data.student;
              setAuthStudent(student);
              setLoginUsername(student.username);
              setProgram(student.programme);
              setSemester(student.current_semester === null ? "Graduated" : String(student.current_semester));
              setCgpa(student.synthetic_cgpa === null ? "" : String(student.synthetic_cgpa));
              setSyntheticStudentId(student.id);
              setCredits("");
              setMessages([{ id: 0, role: "bot", text: GREETING }]);
              setLoginPassword("");
            } catch (error) {
              setLoginError(error instanceof Error ? error.message : "Account access failed.");
            } finally { setLoginBusy(false); }
          }}>
            <label className="login-field"><span>User ID</span>
              <select autoComplete="username" value={loginUsername} onChange={(event) => setLoginUsername(event.target.value)} required>
                <option value="" disabled>Select User ID</option>
                {demoAccountOptions.filter((account) => /^VU00[1-9]$|^VU010$/.test(account.username)).map((account) => <option key={account.profileId} value={account.username}>{account.username}</option>)}
              </select>
            </label>
            <label className="login-field"><span>Password (same for all demo accounts)</span><input type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="1234" required /></label>
            {loginError && <p className="login-error" role="alert">{loginError}</p>}
            <button className="login-submit" type="submit" disabled={loginBusy || (authMode === "signup" && demoAccountOptions.length === 0)}>{loginBusy ? (authMode === "signup" ? "Activating scenario…" : "Signing in…") : (authMode === "signup" ? "Sign up / Activate demo profile" : "Log in")}</button>
          </form>
          <p className="login-note">{authMode === "signup" ? "Signup activates one of the 10 pre-provisioned synthetic scenarios. It does not create a permanent custom account. User ID is the assigned code VU001–VU010; shared demo password: 1234." : "Use the assigned synthetic User ID (VU001–VU010). Shared demo password: 1234. These public classroom accounts must never be used for real data."}</p>
        </div>
      </div>
    );
  }

  const lastBotId = [...messages].reverse().find((m) => m.role === "bot")?.id;
  const live = presence !== "off";

  return (
    <div className="app">
      <div className="bg" aria-hidden="true" />

      <aside className={`sidebar ${sidebarOpen ? "" : "closed"}`}>
        <button
          className="toggle"
          onClick={() => setSidebarOpen((o) => !o)}
          aria-label={sidebarOpen ? "Hide side panel" : "Show side panel"}
          aria-expanded={sidebarOpen}
        >
          ‹
        </button>
        <div className="side-body">
          <img className="logo" src="/logo.png" alt="Vidyashilp University" />
          <h2>Student Account</h2>
          <div className="account-meta">
            <strong>{authStudent?.name}</strong>
            <span>Username: {authStudent?.username}</span>
            <span>Synthetic ID: {authStudent?.synthetic_student_id}</span>
            <span>Programme: {authStudent?.programme}</span>
            <span>Admission batch: {authStudent?.admission_batch}</span>
            <span>Semester: {authStudent?.current_semester === null ? "Graduated" : authStudent?.current_semester}</span>
            <span>Status: {authStudent?.academic_status}</span>
            <span>Demo CGPA: {authStudent?.synthetic_cgpa ?? "Not provided"}</span>
          </div>
          <button className="clear" onClick={async () => {
            cancelPendingWork();
            await fetch("/api/auth/logout", { method: "POST" });
            setAuthStudent(null);
            setLoginPassword("");
            setLoginError("");
            setMessages([{ id: 0, role: "bot", text: GREETING }]);
            setAttachments([]);
            setAttachmentContext([]);
            setProgram("Not specified");
            setSemester("Not specified");
            setCredits("");
            setCgpa("");
            setSyntheticStudentId("");
          }}>Log out</button>
          <button className="clear" onClick={clearChat}>Clear Chat</button>
          <button className="clear" type="button" aria-expanded={privacyOpen} onClick={() => setPrivacyOpen((open) => !open)}>{privacyOpen ? "Hide Privacy & Security" : "Privacy & Security"}</button>
          {privacyOpen && <section className="privacy-panel" aria-label="Privacy and Security information">
            <h3>Privacy & Security</h3>
            <p><strong>Synthetic demo only.</strong> This app is not connected to Digiicampus or real VU student records. Academic advice is not an official approval.</p>
            <p><strong>Information used:</strong> your signed-in synthetic profile and its academic records are used to answer account-specific questions.</p>
            <p><strong>Sent to the AI provider:</strong> your question, relevant profile/course context, and any file or image you choose to upload may be sent to Groq for processing. Voice recordings sent for transcription are also processed by Groq.</p>
            <p><strong>Never enter:</strong> real student IDs, passwords, Digiicampus credentials, private student records, financial details, or sensitive personal information.</p>
            <p><strong>Account safety:</strong> use only the public demo credentials. Logout ends the app session and clears the session cookie. Do not share the demo password.</p>
            <p><strong>Chat:</strong> Clear Chat removes the current conversation from this page state. It cannot recall information already sent to the AI provider.</p>
            <p><strong>Important:</strong> synthetic names, IDs, grades and CGPAs are fictional. Verify academic rules with official VU sources.</p>
          </section>}
        </div>
      </aside>

      <main className="main">
        <div className="pill-wrap">
          <div className="pill">
            <span className="av-lg">
              <span className={`ring ${live ? "on" : ""}`} />
              <span className="av-in"><img src="/symbol.jpg" alt="Vikki Talk by VU" /></span>
            </span>
            <span className="pill-title">VIKKI TALK BY VU</span>
          </div>
        </div>

        <div className="chat" role="log" aria-live="polite">
          <div className="chat-inner">
            {messages.map((m) =>
              m.role === "user" ? (
                <div className="row user" key={m.id}>
                  <div className="bubble user">
                    {m.text}
                    {m.files && m.files.length > 0 && <div className="files">📎 {m.files.join(", ")}</div>}
                    {m.imageFiles && m.imageFiles.length > 0 && (
                      <div className="user-image-previews">
                        {m.imageFiles.map((image, index) => {
                          const imageKey = `${m.id}:${image.name}`;
                          return (
                            <div className="user-image-preview" key={image.name + "-" + index}>
                              <img src={image.url} alt={"Uploaded image: " + image.name} />
                              <div className="image-preview-actions">
                                <span>{image.name}</span>
                                <button type="button" onClick={() => void copyImage(m.id, image)} aria-label={"Copy image " + image.name}>
                                  {copiedImageKey === imageKey ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                                  {copiedImageKey === imageKey ? "Copied" : "Copy image"}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="row bot" key={m.id}>
                  <span className="av-sm">
                    <img src="/symbol.jpg" alt="" />
                    <span className={`dot ${live && m.id === lastBotId ? "on" : ""}`} />
                  </span>
                  <div className="bubble bot">
                    <div className="answer-text">{renderAnswer(m.text)}</div>
                    {m.pipeline?.some((step) => step.includes("Orchestrated six deterministic specialist stages")) && <details className="agent-workflow"><summary>Agent workflow — 6 specialist stages</summary><ol>{m.pipeline.filter((step) => /^(?:Student-profile|Course-retrieval|Credit-calculation|Eligibility|Verification|Recommendation) agent:/.test(step)).map((step) => <li key={step}>{step}</li>)}</ol><p>Deterministic workflow using this signed-in synthetic profile and batch-matched course records. It does not make official enrolment decisions.</p></details>}
                    {renderVisualization(m.visualization)}
                    {m.followUps && m.followUps.length > 0 && <div className="follow-ups">{m.followUps.map((followUp) => <button key={followUp} type="button" onClick={() => send(followUp)} disabled={busy}>{followUp}</button>)}</div>}

                    <div className="answer-tools" role="group" aria-label="Answer actions">
                      <button type="button" className="answer-tool" onClick={() => void copyAnswer(m.id, m.text)} aria-label={copiedId === m.id ? "Response copied" : "Copy response"} title={copiedId === m.id ? "Copied" : "Copy response"}>
                        {copiedId === m.id ? <Check size={16} aria-hidden="true" focusable="false" /> : <Copy size={16} aria-hidden="true" focusable="false" />}
                        <span>{copiedId === m.id ? "Copied" : "Copy"}</span>
                      </button>
                      <button type="button" className="answer-tool" onClick={() => toggleSpeech(m.id, m.text)} aria-label={speakingId === m.id ? "Stop speaking" : "Read answer aloud"} title={speakingId === m.id ? "Stop speaking" : "Read answer aloud"}>
                        {speakingId === m.id ? <VolumeX size={16} aria-hidden="true" focusable="false" /> : <Volume2 size={16} aria-hidden="true" focusable="false" />}
                        <span>{speakingId === m.id ? "Stop" : "Read aloud"}</span>
                      </button>

                    </div>
                    {m.sources && m.sources.length > 0 && (
                      <div className="sources">
                        {compactSources(m.sources).map((s, i) =>
                          s.url ? (
                            <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>
                          ) : (
                            <span key={s.title + "-" + i}>{s.title}</span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {busy && (
              <div className="row bot">
                <span className="av-sm"><img src="/symbol.jpg" alt="" /><span className="dot on" /></span>
                <div className="bubble bot typing" aria-label="Advisor is typing"><i /><i /><i /></div>
              </div>
            )}
            <div ref={endRef} />
          </div>
        </div>

        <div className="dock">
          <div className="chips">
            {CHIPS.map((c) => (
              <button key={c} className="chip" onClick={() => send(c)} disabled={busy}>{c}</button>
            ))}

          </div>
          {attachments.length > 0 && (
            <div className="attached">
              {attachments.map((file, index) => {
                const preview = pendingImageUrls.get(file);
                return (
                  <div key={file.name + "-" + file.lastModified + "-" + index} className="attachment-draft">
                    {preview && <img src={preview} alt={"Preview of " + file.name} />}
                    <span className="file-chip">
                      {file.name}
                      <button type="button" aria-label={"Remove " + file.name} onClick={() => setAttachments((current) => current.filter((item) => item !== file))}>
                        <X size={13} />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {notice && <div className="notice">{notice}</div>}
          <form className="composer" onSubmit={(e) => { e.preventDefault(); send(); }} onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); addFiles(e.dataTransfer.files); } }}>
            <textarea
              ref={draftRef}
              rows={1}
              placeholder={recording ? "Recording… tap the square to stop" : transcribing ? "Transcribing audio…" : "Ask an academic question…"}
              onPaste={(e) => {
                const pastedImages = Array.from(e.clipboardData.items)
                  .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
                  .map((item) => item.getAsFile())
                  .filter((file): file is File => file !== null);
                if (pastedImages.length) { e.preventDefault(); addFileItems(pastedImages); }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
              }}
            />
            <button type="button" className={`tool ${recording ? "rec" : ""}`} onClick={toggleMic} disabled={busy || transcribing}
              aria-label={recording ? "Stop recording" : "Record a voice message"}>
              {recording ? <><Square size={16} fill="currentColor" /><b>{fmt(seconds)}</b></> : <Mic size={22} />}
            </button>
            <button type="button" className="tool" onClick={() => cameraInput.current?.click()} aria-label="Take or attach a photo">
              <Camera size={22} />
            </button>
            <button type="button" className="tool" onClick={() => fileInput.current?.click()} aria-label="Attach a file">
              <FileText size={22} />
            </button>
            <button type="submit" className="send" aria-label="Send" disabled={busy || recording || transcribing}>
              <ArrowUp size={22} />
            </button>
            <input ref={fileInput} type="file" hidden multiple
              accept=".pdf,.docx,.txt,.md,.csv,.xlsx,.pptx,image/*,audio/*"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            <input ref={cameraInput} type="file" hidden accept="image/*" capture="environment"
              onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
          </form>
          <p className="disclaimer">AI-generated responses may contain errors. Please verify important academic information with official university sources.</p>
        </div>
      </main>
    </div>
  );
}
