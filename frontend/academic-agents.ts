import syntheticStudentData from "./data/synthetic-students.json";
import { parsePrerequisiteExpression } from "./lib/prerequisites";

export type AgentCourseRecord = {
  course_code: string;
  course_title: string;
  prerequisite?: string;
  credits?: string | number;
  batch?: string;
  semester?: number;
  source?: string;
  cells?: Record<string, string>;
  document_type?: string;
  is_course_record?: boolean;
  programme?: string;
};

export type SyntheticStudent = {
  id: string;
  programme: string;
  admission_batch: string;
  current_semester: number | null;
  completed_course_codes: string[];
  failed_course_codes: string[];
  declared_minor: string;
};

export type AgentWorkflowResult = {
  student: SyntheticStudent;
  course: AgentCourseRecord;
  prerequisites: string[];
  eligibility: "prerequisites_met" | "prerequisite_failed" | "insufficient_information";
  failedPrerequisites: string[];
  unverifiedPrerequisites: string[];
  ambiguousPrerequisiteGroups: string[][];
  missingPrerequisiteRows: string[];
  calculatedCredits: number;
  creditCourseCodes: string[];
  missingCreditRecords: string[];
  evidenceRecords: AgentCourseRecord[];
  evidenceVerified: boolean;
  recommendation: string;
  stages: string[];
};

const students = syntheticStudentData.students as SyntheticStudent[];

export function getSyntheticStudent(id: string): SyntheticStudent | undefined {
  return students.find((student) => student.id.toUpperCase() === id.trim().toUpperCase());
}

function normalizeCode(value: unknown): string {
  return String(value || "").replace(/[\s-]/g, "").toUpperCase();
}

/** Match B.Tech branch labels such as "B.Tech CSE" to workbook degree label "B.Tech". Other programmes must match exactly. */
function matchesProgramme(recordProgramme: unknown, studentProgramme: unknown): boolean {
  const record = String(recordProgramme || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const student = String(studentProgramme || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (record === student) return true;
  return record === "btech" && /^btech(?:[a-z0-9]+)?$/.test(student);
}

/** Agent 1: retrieves the synthetic student record selected for the demo. */
export function studentProfileAgent(id: string): SyntheticStudent | undefined {
  return getSyntheticStudent(id);
}

/** Agent 2: retrieves the exact course row for the student's admission batch. */
export function courseRetrievalAgent(
  code: string,
  student: SyntheticStudent,
  records: AgentCourseRecord[],
): AgentCourseRecord | undefined {
  const target = normalizeCode(code);
  return records.find((record) =>
    normalizeCode(record.course_code) === target &&
    String(record.batch || "") === student.admission_batch &&
    record.document_type === "semester_spread" &&
    record.is_course_record !== false &&
    matchesProgramme(record.programme, student.programme)
  );
}

/** Agent 3: calculates credits only from passed courses with matching batch records. */
export function creditCalculationAgent(
  student: SyntheticStudent,
  records: AgentCourseRecord[],
): { total: number; courseCodes: string[]; missing: string[]; evidence: AgentCourseRecord[] } {
  const uniqueCodes = [...new Set(student.completed_course_codes.map(normalizeCode))];
  const evidence: AgentCourseRecord[] = [];
  const missing: string[] = [];
  let total = 0;
  for (const code of uniqueCodes) {
    const row = records.find((record) =>
      normalizeCode(record.course_code) === code &&
      String(record.batch || "") === student.admission_batch &&
      record.document_type === "semester_spread" &&
      record.is_course_record !== false &&
      matchesProgramme(record.programme, student.programme)
    );
    const credits = Number(row?.credits);
    if (!row || !Number.isFinite(credits) || credits < 0) {
      missing.push(code);
      continue;
    }
    evidence.push(row);
    total += credits;
  }
  return { total, courseCodes: evidence.map((row) => normalizeCode(row.course_code)), missing, evidence };
}

/** Agent 4: checks direct prerequisites against the synthetic passed/failed course lists. */
export function eligibilityAgent(
  student: SyntheticStudent,
  course: AgentCourseRecord,
  records: AgentCourseRecord[],
): {
  status: AgentWorkflowResult["eligibility"];
  prerequisites: string[];
  failed: string[];
  unverified: string[];
  ambiguousPrerequisiteGroups: string[][];
  evidence: AgentCourseRecord[];
} {
  const parsed = parsePrerequisiteExpression(course.prerequisite);
  const prerequisites = parsed.codes;
  const completed = new Set(student.completed_course_codes.map(normalizeCode));
  const failedCourses = new Set(student.failed_course_codes.map(normalizeCode));
  const slashCodes = new Set(parsed.ambiguousSlashGroups.flat());
  const requiredSeparately = prerequisites.filter((code) => !slashCodes.has(code));
  const failed = requiredSeparately.filter((code) => failedCourses.has(code));
  const unverified = requiredSeparately.filter((code) => !completed.has(code) && !failedCourses.has(code));

  // The workbook writes "COMP210/COMP301" but does not define whether slash
  // means both courses or either course. Only a uniformly passed or failed
  // group can be resolved without inventing that meaning.
  for (const group of parsed.ambiguousSlashGroups) {
    const allPassed = group.every((code) => completed.has(code));
    const allFailed = group.every((code) => failedCourses.has(code));
    if (allFailed) failed.push(...group);
    else if (!allPassed) unverified.push(group.join("/") + " (the workbook does not define the slash relationship)");
  }

  const evidence = prerequisites.flatMap((code) => {
    const row = records.find((record) =>
      normalizeCode(record.course_code) === code &&
      String(record.batch || "") === student.admission_batch &&
      record.document_type === "semester_spread" &&
      record.is_course_record !== false &&
      matchesProgramme(record.programme, student.programme)
    );
    return row ? [row] : [];
  });
  const status = failed.length
    ? "prerequisite_failed"
    : unverified.length
      ? "insufficient_information"
      : "prerequisites_met";
  return { status, prerequisites, failed, unverified, ambiguousPrerequisiteGroups: parsed.ambiguousSlashGroups, evidence };
}

/** Agent 5: verifies that the target and all stated prerequisite rows exist in the source dataset. */
export function verificationAgent(
  course: AgentCourseRecord,
  prerequisites: string[],
  records: AgentCourseRecord[],
  student: SyntheticStudent,
): { verified: boolean; evidence: AgentCourseRecord[]; missingCodes: string[] } {
  const required = [...new Set([normalizeCode(course.course_code), ...prerequisites])];
  const evidence = required.flatMap((code) => {
    const row = records.find((record) =>
      normalizeCode(record.course_code) === code &&
      String(record.batch || "") === student.admission_batch &&
      record.document_type === "semester_spread" &&
      record.is_course_record !== false &&
      matchesProgramme(record.programme, student.programme) &&
      Boolean(record.source) && Boolean(record.cells)
    );
    return row ? [row] : [];
  });
  const present = new Set(evidence.map((row) => normalizeCode(row.course_code)));
  const missingCodes = required.filter((code) => !present.has(code));
  return { verified: missingCodes.length === 0, evidence, missingCodes };
}

/** Agent 6: gives a limited recommendation; it does not decide university enrolment. */
export function recommendationAgent(
  status: AgentWorkflowResult["eligibility"],
  failed: string[],
  unverified: string[],
): string {
  if (status === "prerequisites_met") {
    return "The listed direct prerequisites are recorded as completed in this synthetic profile. This is only a prerequisite check, not confirmation of registration or overall university eligibility.";
  }
  if (status === "prerequisite_failed") {
    return "The synthetic profile records a failed direct prerequisite (" + failed.join(", ") + "). The prerequisite check is not met; consult the Faculty Advisor before planning registration.";
  }
  return "The available synthetic profile does not establish completion of every direct prerequisite (" + unverified.join(", ") + "). More verified student information is required before advising.";
}

/** Orchestrator: runs the specialist stages in a controlled sequence. */
export function runAcademicAdvisorAgentWorkflow(
  studentId: string,
  courseCode: string,
  records: AgentCourseRecord[],
): AgentWorkflowResult | undefined {
  const student = studentProfileAgent(studentId);
  if (!student) return undefined;
  const course = courseRetrievalAgent(courseCode, student, records);
  if (!course) return undefined;
  const credit = creditCalculationAgent(student, records);
  const eligibility = eligibilityAgent(student, course, records);
  const verification = verificationAgent(course, eligibility.prerequisites, records, student);
  let recommendation = verification.verified
    ? recommendationAgent(eligibility.status, eligibility.failed, eligibility.unverified)
    : "Source verification is incomplete. Do not make an eligibility recommendation from this record.";
  if (eligibility.ambiguousPrerequisiteGroups.length) {
    recommendation += " The workbook uses slash-separated prerequisite notation (" +
      eligibility.ambiguousPrerequisiteGroups.map((group) => group.join("/")).join("; ") +
      ") but does not say whether the codes are alternatives or jointly required, so the relationship is not assumed.";
  }
  return {
    student, course, prerequisites: eligibility.prerequisites,
    eligibility: verification.verified ? eligibility.status : "insufficient_information",
    failedPrerequisites: eligibility.failed,
    unverifiedPrerequisites: eligibility.unverified,
    ambiguousPrerequisiteGroups: eligibility.ambiguousPrerequisiteGroups,
    missingPrerequisiteRows: verification.missingCodes.filter((code) => normalizeCode(code) !== normalizeCode(course.course_code)),
    calculatedCredits: credit.total,
    creditCourseCodes: credit.courseCodes,
    missingCreditRecords: credit.missing,
    evidenceRecords: [...new Map([...verification.evidence, ...credit.evidence].map((row) => [normalizeCode(row.course_code), row])).values()],
    evidenceVerified: verification.verified,
    recommendation,
    stages: [
      "Student-profile agent: loaded the selected synthetic student record",
      "Course-retrieval agent: retrieved the exact admission-batch course row",
      "Credit-calculation agent: summed credits from completed-course rows with matching source records",
      "Eligibility agent: checked each direct prerequisite against passed and failed course lists",
      "Verification agent: checked course and prerequisite evidence against source workbook rows",
      "Recommendation agent: produced a limited, non-authoritative prerequisite recommendation",
    ],
  };
}
