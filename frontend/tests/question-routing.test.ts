import { beforeAll, describe, expect, it } from "vitest";

let POST: (request: Request) => Promise<Response>;
let auth: typeof import("../lib/demo-auth");

beforeAll(async () => {
  process.env.SESSION_SECRET = "question-routing-test-secret-".padEnd(40, "x");
  delete process.env.GROQ_API_KEY;
  auth = await import("../lib/demo-auth");
  POST = (await import("../app/api/chat/route")).POST;
});

async function ask(
  question: string,
  profileId = "SYN-106",
  history: Array<{ role: "user" | "assistant"; text: string }> = []
) {
  const form = new FormData();
  form.append("question", question);
  form.append("history", JSON.stringify(history));
  const cookie = auth.demoSessionCookieName + "=" + auth.createSessionToken(profileId);
  const response = await POST(new Request("http://localhost/api/chat", {
    method: "POST",
    body: form,
    headers: { cookie },
  }));
  const body = await response.json() as {
    answer?: string;
    error?: string;
    code?: string;
    model?: string;
  };
  return { status: response.status, ...body };
}

describe("academic question routing", () => {
  it("routes a bare course code to the structured course lookup", async () => {
    const result = await ask("COMP302");
    expect(result.status).toBe(200);
    expect(result.answer).toContain("Internet of Things");
    expect(result.answer).not.toMatch(/Could you clarify what you mean/i);
    expect(result.model).toMatch(/structured course lookup/i);
  });

  it("routes a bare one-word course title to the structured course lookup", async () => {
    const result = await ask("Networks");
    expect(result.status).toBe(200);
    expect(result.answer).toContain("COMP208");
    expect(result.answer).not.toMatch(/Could you clarify what you mean/i);
    expect(result.model).toMatch(/structured course lookup/i);
  });

  it("routes a one-word attendance question to the attendance policy handler", async () => {
    const result = await ask("attendance");
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/VU attendance rule/i);
    expect(result.answer).toContain("75%");
    expect(result.answer).not.toMatch(/Could you clarify what you mean/i);
  });

  it("recognizes missing a class because of illness as an attendance question", async () => {
    const result = await ask("What should I do if I miss a class due to illness?");
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/Missed class due to illness/i);
    expect(result.answer).toContain("75%");
    expect(result.answer).toMatch(/day you rejoin/i);
    expect(result.answer).toMatch(/Digii/i);
    expect(result.answer).not.toMatch(/limited to B\.Tech academic advising/i);
  });

  it("applies the 65% floor to a percentage-only follow-up about exam eligibility", async () => {
    const result = await ask(
      "I have 64%, can I appear for the exam?",
      "SYN-103",
      [
        { role: "user", text: "minimum attendance requirement?" },
        { role: "assistant", text: "**VU attendance rule** The normal attendance threshold is 75% in each registered course. Special medical relaxation cannot go below 65%." },
      ]
    );
    expect(result.status).toBe(200);
    expect(result.answer).toContain("64%");
    expect(result.answer).toMatch(/65% absolute minimum/i);
    expect(result.answer).toMatch(/not be eligible to sit the End-Term Examination/i);
    expect(result.answer).not.toMatch(/could not generate|GROQ_API_KEY/i);
  });

  it("explains the medical-leave process instead of giving only the generic attendance rule", async () => {
    const result = await ask("I missed a class due to illness. Can I get attendance?");
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/serious medical exigencies/i);
    expect(result.answer).toMatch(/hospitalization, trauma or contagious disease/i);
    expect(result.answer).toMatch(/Faculty Advisor/i);
    expect(result.answer).toMatch(/day you rejoin/i);
    expect(result.answer).toMatch(/Digii/i);
    expect(result.answer).toMatch(/entire day/i);
    expect(result.answer).toMatch(/cannot confirm that attendance will be granted/i);
    expect(result.answer).not.toMatch(/limited to B\.Tech academic advising/i);
  });

  it("does not carry an old course lookup into a personal current-semester L-T-P request", async () => {
    const result = await ask(
      "L-T-P structure of my current course structure",
      "SYN-104",
      [
        { role: "user", text: "course code of calculus" },
        { role: "assistant", text: "**Course details** Calculus is listed in the semester-spread workbook. Course code MATH208." },
      ]
    );
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/Semester 4 L-T-P for Kavya Iyer/i);
    expect(result.answer).toContain("MATH206");
    expect(result.answer).toContain("COMP301");
    expect(result.answer).toContain("0-0-4");
    expect(result.answer).not.toMatch(/Calculus|MATH208/);
  });

  it("interprets 'my all courses' as the signed-in student's current-semester course list for L-T-P", async () => {
    const result = await ask("L-T-P of my all courses", "SYN-104");
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/Semester 4 L-T-P for Kavya Iyer/i);
    for (const code of ["UCOR205", "MATH206", "COMP207", "COMP301", "COMP205", "MATH301"]) {
      expect(result.answer).toContain(code);
    }
    expect(result.answer).toContain("2-1-0");
    expect(result.answer).toContain("0-0-4");
    expect(result.answer).toContain("3-1-0");
    expect(result.answer).not.toMatch(/GROQ_API_KEY|could not generate/i);
  });

  it("does not reject an arrear question as unrelated", async () => {
    const result = await ask("I have one arrear. What should I do?");
    // No Groq key is configured. This explicit configuration response proves
    // the academic scope gate allowed the question instead of refusing it.
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/GROQ_API_KEY is missing/i);
  });

  it("does not reject an uncleared-paper question as unrelated", async () => {
    const result = await ask("I couldn't clear one paper. What happens next?");
    expect(result.status).toBe(503);
    expect(result.error).toMatch(/GROQ_API_KEY is missing/i);
  });

  it("continues to reject clearly unrelated general-knowledge questions", async () => {
    const result = await ask("What is the capital of France?");
    expect(result.status).toBe(200);
    expect(result.answer).toMatch(/limited to B\.Tech academic advising/i);
  });
});
