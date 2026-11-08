import { describe, expect, it } from "vitest";
import knowledgeData from "../data/vu-academic-knowledge.json";
import {
  eligibilityAgent,
  verificationAgent,
  type AgentCourseRecord,
  type SyntheticStudent,
} from "../academic-agents";
import { parsePrerequisiteExpression } from "../lib/prerequisites";

const records = knowledgeData.courseRecords as unknown as AgentCourseRecord[];
const data207 = records.find((record) =>
  record.batch === "2022" && record.course_code === "DATA207"
)!;

function student(overrides: Partial<SyntheticStudent> = {}): SyntheticStudent {
  return {
    id: "SYN-PREREQ-TEST",
    programme: "B.Tech CSE",
    admission_batch: "2022",
    current_semester: 5,
    completed_course_codes: ["COMP301"],
    failed_course_codes: [],
    declared_minor: "Not specified",
    ...overrides,
  };
}

describe("prerequisite expression parsing", () => {
  it("parses comma and semicolon delimiters while preserving source order", () => {
    const parsed = parsePrerequisiteExpression("COMP132, COMP201; COMP208");
    expect(parsed.codes).toEqual(["COMP132", "COMP201", "COMP208"]);
    expect(parsed.ambiguousSlashGroups).toEqual([]);
  });

  it("extracts slash-separated course codes and marks their relationship ambiguous", () => {
    const parsed = parsePrerequisiteExpression("COMP210/COMP301");
    expect(parsed.codes).toEqual(["COMP210", "COMP301"]);
    expect(parsed.ambiguousSlashGroups).toEqual([["COMP210", "COMP301"]]);
  });

  it("does not invent an AND/OR meaning for DATA207's cohort source notation", () => {
    const result = eligibilityAgent(student(), data207, records);
    expect(result.prerequisites).toEqual(["COMP210", "COMP301"]);
    expect(result.ambiguousPrerequisiteGroups).toEqual([["COMP210", "COMP301"]]);
    expect(result.status).toBe("insufficient_information");
    expect(result.unverified).toContain(
      "COMP210/COMP301 (the workbook does not define the slash relationship)",
    );
  });

  it("reports the missing same-batch workbook row instead of treating an absent course as verified", () => {
    const eligibility = eligibilityAgent(student(), data207, records);
    const verification = verificationAgent(data207, eligibility.prerequisites, records, student());
    expect(verification.verified).toBe(false);
    expect(verification.missingCodes).toContain("COMP210");
    expect(verification.missingCodes).not.toContain("COMP301");
  });

  it("continues to treat comma-separated prerequisites as separately required courses", () => {
    const course = { ...data207, prerequisite: "COMP210, COMP301" };
    const testStudent = student({
      completed_course_codes: ["COMP301"],
      failed_course_codes: ["COMP210"],
    });
    const result = eligibilityAgent(testStudent, course, records);
    expect(result.status).toBe("prerequisite_failed");
    expect(result.failed).toEqual(["COMP210"]);
    expect(result.ambiguousPrerequisiteGroups).toEqual([]);
  });
});
