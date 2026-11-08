import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_PRIVACY_REDACTION,
  sanitizeAttachmentForPrivacy,
} from "../lib/attachment-privacy";

const ISHA = {
  name: "Isha Kulkarni",
  synthetic_student_id: "VU-SYN-106",
};

function syntheticMarksheet(name: string, syntheticId: string, cgpa = "8.42"): string {
  return [
    "SYNTHETIC DEMONSTRATION RECORD - NOT AN OFFICIAL MARKSHEET",
    "User ID / Student name: " + name,
    "Synthetic ID: " + syntheticId + "    Programme: B.Tech CSE",
    "Academic status: CURRENT    Synthetic CGPA: " + cgpa,
    "COURSE CODE  COURSE TITLE  GRADE  RESULT",
    "COMP201  Data Structures  Synthetic B  Passed",
  ].join("\n");
}

describe("uploaded academic-record privacy", () => {
  it("allows an own synthetic marksheet only when both labelled identity fields match", () => {
    const source = syntheticMarksheet("Isha Kulkarni", "VU-SYN-106", "9.10");
    expect(sanitizeAttachmentForPrivacy(source, ISHA)).toBe(source);
  });

  it("redacts another student's marksheet and removes its personal values", () => {
    const source = syntheticMarksheet("Tara Desai", "VU-SYN-110", "8.42");
    const result = sanitizeAttachmentForPrivacy(source, ISHA);
    expect(result).toBe(ATTACHMENT_PRIVACY_REDACTION);
    expect(result).not.toContain("Tara");
    expect(result).not.toContain("8.42");
  });

  it("does not let an unlabelled mention of the signed-in first name spoof ownership", () => {
    const source = syntheticMarksheet("Tara Desai", "VU-SYN-110", "8.42") +
      "\nNote: shared with Isha for review.";
    expect(sanitizeAttachmentForPrivacy(source, ISHA)).toBe(ATTACHMENT_PRIVACY_REDACTION);
  });

  it("fails closed when the synthetic ID is missing", () => {
    const source = [
      "ACADEMIC TRANSCRIPT",
      "Student name: Isha Kulkarni",
      "CGPA: 9.10",
      "Result: Passed",
    ].join("\n");
    expect(sanitizeAttachmentForPrivacy(source, ISHA)).toBe(ATTACHMENT_PRIVACY_REDACTION);
  });

  it("fails closed when the owner name is missing or ambiguous", () => {
    const missingName = syntheticMarksheet("Unknown", "VU-SYN-106", "9.10")
      .replace("User ID / Student name: Unknown", "Student identity: unavailable");
    const conflictingNames = syntheticMarksheet("Isha Kulkarni", "VU-SYN-106", "9.10") +
      "\nStudent name: Tara Desai";
    expect(sanitizeAttachmentForPrivacy(missingName, ISHA)).toBe(ATTACHMENT_PRIVACY_REDACTION);
    expect(sanitizeAttachmentForPrivacy(conflictingNames, ISHA)).toBe(ATTACHMENT_PRIVACY_REDACTION);
  });

  it("fails closed when the name matches but the synthetic ID belongs to another profile", () => {
    const source = syntheticMarksheet("Isha Kulkarni", "VU-SYN-110", "9.10");
    expect(sanitizeAttachmentForPrivacy(source, ISHA)).toBe(ATTACHMENT_PRIVACY_REDACTION);
  });

  it("does not classify a general university attendance-policy document as a personal record", () => {
    const policy = "Student Handbook Clause 7.2: A student must maintain 75% attendance in each registered course.";
    expect(sanitizeAttachmentForPrivacy(policy, ISHA)).toBe(policy);
  });
});
