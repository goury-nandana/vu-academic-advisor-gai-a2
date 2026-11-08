import { NextResponse } from "next/server";
import { getAuthenticatedStudent } from "../../../lib/demo-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;

async function transcribe(file: File, key: string): Promise<string> {
  const attempt = async () => {
    const body = new FormData();
    body.append("file", file, file.name || "voice.webm");
    body.append("model", "whisper-large-v3-turbo");
    body.append("response_format", "json");
    return fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key },
      body,
      signal: AbortSignal.timeout(45000),
      cache: "no-store",
    });
  };

  let response = await attempt();
  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") || "0");
    if (Number.isFinite(retryAfter) && retryAfter > 0 && retryAfter <= 15) {
      await new Promise((resolve) => setTimeout(resolve, Math.ceil(retryAfter * 1000) + 250));
      response = await attempt();
    }
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.clone().json() as { error?: { message?: string } };
      detail = payload.error?.message || "";
    } catch {
      // Keep the response status when the provider does not return JSON.
    }
    throw new Error(response.status === 429
      ? "Speech transcription is temporarily rate-limited. Please try again shortly."
      : "Speech transcription failed (HTTP " + response.status + "). " + detail.slice(0, 240));
  }
  const result = await response.json() as { text?: string };
  return String(result.text || "").trim();
}

export async function POST(request: Request) {
  // Transcription uses a paid provider key, so gate it with the same account session as chat.
  const authenticatedStudent = getAuthenticatedStudent(request);
  if (!authenticatedStudent) {
    return NextResponse.json({ error: "Please log in with a synthetic student account before using voice transcription." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  const expectedProfileId = request.headers.get("x-expected-profile-id");
  if (expectedProfileId && expectedProfileId !== authenticatedStudent.id) {
    return NextResponse.json({ error: "Your session changed in another tab or window. Reload this page to continue as the signed-in student.", code: "SESSION_CHANGED" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  }
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin) {
    try {
      if (!requestHost || new URL(origin).host.toLowerCase() !== requestHost.toLowerCase()) {
        return NextResponse.json({ error: "Cross-origin transcription requests are not accepted." }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
    }
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BYTES + 512 * 1024) {
    return NextResponse.json({ error: "The audio request is larger than the allowed upload limit." }, { status: 413 });
  }
  const key = process.env.GROQ_API_KEY?.trim() || "";
  if (!key) {
    return NextResponse.json({ error: "Speech transcription is not configured on the server." }, { status: 503 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Could not read the audio upload." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose an audio recording to transcribe." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "The recording must be non-empty and no larger than 4 MB." }, { status: 413 });
  }
  if (!file.type.startsWith("audio/") && !/\.(?:webm|m4a|mp3|wav|ogg|flac)$/i.test(file.name)) {
    return NextResponse.json({ error: "The uploaded file is not a supported audio recording." }, { status: 415 });
  }

  try {
    const text = await transcribe(file, key);
    return NextResponse.json({ text }, {
      headers: { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    console.error("[VU Academic Advisor] Voice transcription failed", error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Voice transcription failed. Please try again.",
    }, { status: 502 });
  }
}
