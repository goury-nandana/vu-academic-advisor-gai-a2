import syntheticStudents from "../data/synthetic-students.json";

type CurrentStudent = {
  username: string;
  name: string;
  synthetic_student_id: string;
} | null | undefined;

type SyntheticStudent = {
  username: string;
  name: string;
  synthetic_student_id: string;
};

const knownStudents = syntheticStudents.students as SyntheticStudent[];

function includesIdentity(question: string, identity: string): boolean {
  const normalizedIdentity = identity.trim().toLowerCase();
  if (!normalizedIdentity) return false;
  const escaped = normalizedIdentity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("(^|[^a-z0-9])" + escaped + "([^a-z0-9]|$)", "i").test(question);
}

/**
 * Classifies marksheet requests in the client-side shortcut.
 * Explicit requests naming a different synthetic account are refused locally,
 * so the shortcut cannot silently download the authenticated user's PDF instead.
 */
export function classifyMarksheetRequest(
  question: string,
  currentStudent: CurrentStudent
): "self" | "other" | "none" {
  const normalizedQuestion = String(question || "").toLowerCase();
  const isMarksheetIntent =
    /\b(marksheet|mark sheet|transcript)\b/.test(normalizedQuestion) &&
    /\b(download|get|generate|give|show|need|want|provide|my)\b/.test(normalizedQuestion);
  if (!isMarksheetIntent) return "none";

  if (currentStudent) {
    const currentIdentities = [currentStudent.username, currentStudent.synthetic_student_id, currentStudent.name]
      .map((identity) => String(identity || "").trim().toLowerCase())
      .filter(Boolean);
    const otherAccountMentioned = knownStudents.some((student) => {
      const studentIdentities = [student.username, student.synthetic_student_id, student.name]
        .map((identity) => String(identity || "").trim().toLowerCase())
        .filter(Boolean);
      const isCurrent = studentIdentities.some((identity) => currentIdentities.includes(identity));
      if (isCurrent) return false;
      return studentIdentities.some((identity) => includesIdentity(normalizedQuestion, identity));
    });
    if (otherAccountMentioned) return "other";
  }
  return "self";
}
