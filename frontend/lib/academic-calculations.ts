export type AcademicAttemptRecord = {
  semester: number;
  grade: string | null;
  status: string;
};

export type AcademicCourseRecord = {
  course_code: string;
  course_title?: string;
  semester: number;
  credits: number;
  grade: string | null;
  status: string;
  attempts?: AcademicAttemptRecord[];
};

export type AcademicAttemptRow<T extends AcademicCourseRecord = AcademicCourseRecord> = {
  record: T;
  course_code: string;
  course_title: string;
  credits: number;
  semester: number;
  grade: string | null;
  status: string;
  attemptNumber: number;
};

export function normalizeAcademicCourseCode(value: unknown): string {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

export function isPassedCourseStatus(value: unknown): boolean {
  const status = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return status === "passed" || status === "passed on repeat";
}

/** Counts each course code once, including a course completed on a repeat attempt. */
export function getCompletedCourseRecords<T extends AcademicCourseRecord>(records: T[]): T[] {
  const completed = new Map<string, T>();
  for (const record of records) {
    const code = normalizeAcademicCourseCode(record.course_code);
    if (!code || !isPassedCourseStatus(record.status)) continue;
    if (!completed.has(code)) completed.set(code, record);
  }
  return [...completed.values()];
}

function safeCourseCredits(value: unknown): number {
  const credits = Number(value);
  return Number.isFinite(credits) && credits >= 0 ? credits : 0;
}

export function calculateCompletedCourseCredits<T extends AcademicCourseRecord>(records: T[]): {
  total: number;
  courseCodes: string[];
  records: T[];
} {
  const completedRecords = getCompletedCourseRecords(records);
  return {
    total: completedRecords.reduce((sum, record) => sum + safeCourseCredits(record.credits), 0),
    courseCodes: completedRecords.map((record) => record.course_code),
    records: completedRecords,
  };
}

/** A repeat that has been passed is not an outstanding failed course. */
export function getCurrentlyFailedCourseRecords<T extends AcademicCourseRecord>(records: T[]): T[] {
  return records.filter((record) => String(record.status ?? "").trim().toLowerCase() === "failed");
}

/** Expands recorded attempts so a repeat appears under the semester in which it was attempted. */
export function expandCourseAttempts<T extends AcademicCourseRecord>(records: T[]): AcademicAttemptRow<T>[] {
  const rows: AcademicAttemptRow<T>[] = [];
  for (const record of records) {
    const attempts = Array.isArray(record.attempts) && record.attempts.length
      ? [...record.attempts].sort((a, b) => Number(a.semester) - Number(b.semester))
      : [{ semester: record.semester, grade: record.grade, status: record.status }];
    attempts.forEach((attempt, index) => {
      rows.push({
        record,
        course_code: record.course_code,
        course_title: record.course_title || "",
        credits: safeCourseCredits(record.credits),
        semester: Number(attempt.semester),
        grade: attempt.grade ?? null,
        status: String(attempt.status || "Not recorded"),
        attemptNumber: index + 1,
      });
    });
  }
  return rows.sort((a, b) =>
    a.semester - b.semester ||
    a.course_code.localeCompare(b.course_code) ||
    a.attemptNumber - b.attemptNumber
  );
}

/** Credits passed in a selected semester, counting a repeated course only in its passing attempt. */
export function calculatePassedCreditsForSemester<T extends AcademicCourseRecord>(
  records: T[],
  selectedSemester: number,
): number {
  const passed = new Map<string, number>();
  for (const row of expandCourseAttempts(records)) {
    if (row.semester !== selectedSemester || !isPassedCourseStatus(row.status)) continue;
    const code = normalizeAcademicCourseCode(row.course_code);
    if (code && !passed.has(code)) passed.set(code, row.credits);
  }
  return [...passed.values()].reduce((sum, credits) => sum + credits, 0);
}

export function calculateAttemptedCreditsForSemester<T extends AcademicCourseRecord>(
  records: T[],
  selectedSemester: number,
): number {
  return expandCourseAttempts(records)
    .filter((row) => row.semester === selectedSemester)
    .reduce((sum, row) => sum + row.credits, 0);
}

export function calculateAttemptedCredits<T extends AcademicCourseRecord>(records: T[]): number {
  return expandCourseAttempts(records).reduce((sum, row) => sum + row.credits, 0);
}

export function summarizeAttemptCreditsBySemester<T extends AcademicCourseRecord>(records: T[]): Record<string, number> {
  return expandCourseAttempts(records).reduce((totals, row) => {
    const key = String(row.semester);
    totals[key] = (totals[key] || 0) + row.credits;
    return totals;
  }, {} as Record<string, number>);
}
