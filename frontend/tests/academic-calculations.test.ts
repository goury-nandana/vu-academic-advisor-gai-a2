import { describe, expect, it } from "vitest";
import studentData from "../data/synthetic-students.json";
import knowledgeData from "../data/vu-academic-knowledge.json";
import { creditCalculationAgent, type AgentCourseRecord, type SyntheticStudent } from "../academic-agents";
import {
  calculateCompletedCourseCredits,
  expandCourseAttempts,
  getCurrentlyFailedCourseRecords,
} from "../lib/academic-calculations";
import { createSyntheticMarksheetPdf } from "../lib/synthetic-marksheet-pdf";
import type { SyntheticStudentProfile } from "../lib/demo-auth";

const nandita = (studentData.students as unknown as SyntheticStudentProfile[])
  .find((student) => student.username === "VU007")!;

describe("repeat-course academic calculations", () => {
  it("counts a course marked Passed on repeat once in earned credits", () => {
    const summary = calculateCompletedCourseCredits(nandita.academic_records);
    expect(summary.total).toBe(117);
    expect(summary.courseCodes.filter((code) => code === "COMP201")).toHaveLength(1);
    expect(summary.courseCodes).toHaveLength(41);
    expect(getCurrentlyFailedCourseRecords(nandita.academic_records)).toHaveLength(0);
  });

  it("keeps the failed and passed repeat attempts in their actual semesters", () => {
    const attempts = expandCourseAttempts(nandita.academic_records)
      .filter((row) => row.course_code === "COMP201");
    expect(attempts.map((row) => ({ semester: row.semester, status: row.status }))).toEqual([
      { semester: 2, status: "Failed" },
      { semester: 6, status: "Passed on repeat" },
    ]);
  });

  it("ignores invalid, infinite, and negative credits rather than corrupting totals", () => {
    const summary = calculateCompletedCourseCredits([
      { course_code: "GOOD101", semester: 1, credits: 4, grade: "A", status: "Passed" },
      { course_code: "BAD101", semester: 1, credits: Number.NaN, grade: "A", status: "Passed" },
      { course_code: "BAD102", semester: 1, credits: Number.POSITIVE_INFINITY, grade: "A", status: "Passed" },
      { course_code: "BAD103", semester: 1, credits: -3, grade: "A", status: "Passed" },
    ]);
    expect(summary.total).toBe(4);
  });

  it("matches the specialist agent credit result to the student profile total", () => {
    const agentStudent: SyntheticStudent = {
      id: nandita.id,
      programme: nandita.programme,
      admission_batch: nandita.admission_batch,
      current_semester: nandita.current_semester,
      completed_course_codes: nandita.completed_course_codes,
      failed_course_codes: nandita.failed_course_codes,
      declared_minor: nandita.declared_minor,
    };
    const result = creditCalculationAgent(
      agentStudent,
      knowledgeData.courseRecords as unknown as AgentCourseRecord[],
    );
    expect(result.total).toBe(117);
    expect(result.courseCodes.filter((code) => code === "COMP201")).toHaveLength(1);
    expect(result.missing).toEqual([]);
  });

  it("prints both actual repeat attempts while counting earned credits once", () => {
    const pdf = createSyntheticMarksheetPdf(nandita).toString("ascii");
    expect(pdf).toContain("Cumulative completed credits \\(unique course codes passed\\): 117");
    expect(pdf).toMatch(/2\s+COMP201/);
    expect(pdf).toMatch(/6\s+COMP201/);
    expect(pdf).toContain("Failed");
    expect(pdf).toContain("Passed on repeat");
  });

  it("filters a semester marksheet by the actual attempt semester", () => {
    const semesterTwo = createSyntheticMarksheetPdf(nandita, 2).toString("ascii");
    expect(semesterTwo).toMatch(/2\s+COMP201/);
    expect(semesterTwo).toContain("Failed");
    expect(semesterTwo).not.toMatch(/6\s+COMP201/);

    const semesterSix = createSyntheticMarksheetPdf(nandita, 6).toString("ascii");
    expect(semesterSix).toMatch(/6\s+COMP201/);
    expect(semesterSix).toContain("Passed on repeat");
    expect(semesterSix).not.toMatch(/2\s+COMP201/);
  });
});
