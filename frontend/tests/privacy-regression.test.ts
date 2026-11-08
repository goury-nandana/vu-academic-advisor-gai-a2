import { beforeAll, describe, expect, it } from "vitest";

let POST: (request: Request) => Promise<Response>;
let auth: typeof import("../lib/demo-auth");

beforeAll(async () => {
  process.env.SESSION_SECRET = "privacy-test-secret-".padEnd(40, "x");
  delete process.env.GROQ_API_KEY;
  auth = await import("../lib/demo-auth");
  POST = (await import("../app/api/chat/route")).POST;
});

function syntheticMarksheetText(studentName: string, syntheticId: string, cgpa: string) {
  return [
    "SYNTHETIC DEMONSTRATION RECORD - NOT AN OFFICIAL MARKSHEET",
    "User ID / Student name: " + studentName,
    "Synthetic ID: " + syntheticId + "    Programme: B.Tech CSE",
    "Academic status: CURRENT    Synthetic CGPA: " + cgpa,
    "COURSE CODE  COURSE TITLE  GRADE  RESULT",
    "COMP201  Data Structures  Synthetic B  Passed",
  ].join("\n");
}

async function askWithAttachment(question: string, fileText: string) {
  const form = new FormData();
  form.append("question", question);
  form.append("files", new File([fileText], "marksheet.txt", { type: "text/plain" }));
  const cookie = auth.demoSessionCookieName + "=" + auth.createSessionToken("SYN-106");
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST",
    body: form,
    headers: { cookie },
  }));
  const body = await response.json() as {
    answer?: string;
    model?: string;
    attachmentContext?: string[];
  };
  return { status: response.status, ...body };
}

describe("chat API attachment privacy", () => {
  it("blocks an explicit request for another student's CGPA before model generation", async () => {
    const result = await askWithAttachment(
      "what is her CGPA?",
      syntheticMarksheetText("Tara Desai", "VU-SYN-110", "8.42"),
    );
    expect(result.status).toBe(200);
    expect(result.model).toMatch(/privacy/i);
    expect(result.answer).not.toContain("Tara Desai");
    expect(result.answer).not.toContain("8.42");
    expect(result.attachmentContext?.join("\n")).not.toContain("8.42");
  });

  it("blocks generic 'summarize this file' inspection of another student's marksheet", async () => {
    const result = await askWithAttachment(
      "summarize this file",
      syntheticMarksheetText("Tara Desai", "VU-SYN-110", "8.42"),
    );
    expect(result.status).toBe(200);
    expect(result.model).toMatch(/privacy/i);
    expect(result.answer).not.toContain("Tara Desai");
    expect(result.answer).not.toContain("8.42");
    expect(result.attachmentContext?.join("\n")).not.toContain("8.42");
  });
});
