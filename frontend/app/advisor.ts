// All browser-to-backend traffic is handled here. The default endpoint is same-origin.
export type Source = { title: string; url: string; citation?: number; type?: string };
export type Profile = { program: string; semester: string; completedCredits: string; cgpa: string; syntheticStudentId?: string };
export type HistoryItem = { role: "user" | "assistant"; text: string };
export type Visualization = {
  kind: "bars" | "steps" | "cards" | "course-pathway";
  title: string;
  items: Array<{ label: string; value?: number; valueLabel?: string; detail?: string }>;
  pathway?: {
    target: { code: string; title: string };
    prerequisites: Array<{ code: string; title: string; status: "completed" | "failed" | "unknown" | "not-required"; detail: string }>;
    eligibility: "prerequisites_met" | "prerequisite_failed" | "insufficient_information";
  };
};
export type AdvisorReply = {
  answer: string;
  sources: Source[];
  pipeline: string[];
  model: string;
  visualization?: Visualization;
  followUps: string[];
  fileNotes: string[];
  attachmentContext?: string[];
};

export class AdvisorError extends Error {
  code?: string;
  constructor(message: string, code?: string) { super(message); this.name = "AdvisorError"; this.code = code; }
}

export async function askAdvisor(input: {
  question: string;
  history: HistoryItem[];
  profile: Profile;
  files: File[];
  attachmentContext?: string[];
  /** Consistency check only. The server-side session cookie remains the sole identity authority. */
  expectedProfileId?: string;
  signal?: AbortSignal;
}): Promise<AdvisorReply> {
  const form = new FormData();
  form.append("question", input.question);
  form.append("history", JSON.stringify(input.history));
  form.append("profile", JSON.stringify(input.profile));
  input.files.forEach((file) => form.append("files", file, file.name));
  form.append("attachmentContext", JSON.stringify(input.attachmentContext ?? []));

  const endpoint = "/api/chat";
  const response = await fetch(endpoint, {
    method: "POST",
    body: form,
    cache: "no-store",
    signal: input.signal,
    headers: input.expectedProfileId ? { "x-expected-profile-id": input.expectedProfileId } : undefined,
  });
  const data = await response.json().catch(() => ({})) as Partial<AdvisorReply> & { error?: string; code?: string };
  if (!response.ok) throw new AdvisorError(data.error || "Advisor API returned " + response.status + ".", data.code);
  return {
    answer: data.answer ?? "I could not find an answer to that.",
    sources: Array.isArray(data.sources) ? data.sources : [],
    pipeline: Array.isArray(data.pipeline) ? data.pipeline : [],
    model: data.model ?? "Model not reported",
    visualization: data.visualization,
    followUps: Array.isArray(data.followUps) ? data.followUps : [],
    fileNotes: Array.isArray(data.fileNotes) ? data.fileNotes : [],
    attachmentContext: Array.isArray(data.attachmentContext) ? data.attachmentContext.filter((item): item is string => typeof item === "string") : [],
  };
}


export async function transcribeVoice(file: File, expectedProfileId?: string): Promise<string> {
  const form = new FormData();
  form.append("file", file, file.name);
  const response = await fetch("/api/transcribe", {
    method: "POST",
    body: form,
    cache: "no-store",
    headers: expectedProfileId ? { "x-expected-profile-id": expectedProfileId } : undefined,
  });
  const data = await response.json().catch(() => ({})) as { text?: string; error?: string };
  if (!response.ok) {
    throw new Error(data.error || "Voice transcription returned " + response.status + ".");
  }
  return String(data.text || "").trim();
}
