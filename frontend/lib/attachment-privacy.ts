export type AttachmentPrivacyIdentity = {
  name: string;
  synthetic_student_id: string;
};

export const ATTACHMENT_PRIVACY_REDACTION_PREFIX = "[PRIVACY REDACTED:";
export const ATTACHMENT_PRIVACY_REDACTION =
  "[PRIVACY REDACTED: This attachment appears to contain an individual academic record, but its owner could not be verified against the signed-in synthetic student profile. Personal names, identifiers, CGPA, marks, grades and course results have been withheld.]";

export function isPrivacyRedactedAttachment(text: string): boolean {
  return String(text || "").trimStart().startsWith(ATTACHMENT_PRIVACY_REDACTION_PREFIX);
}

function normalizeIdentity(value: string): string {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function extractStudentNames(text: string): string[] {
  const names = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/\b(?:student\s+name|student|name)\s*[:=]\s*(.+)$/i);
    if (!match) continue;
    const candidate = match[1]
      .split(/\s{2,}/)[0]
      .replace(/\s+(?:synthetic\s*(?:student\s*)?id|programme|program|admission\s+batch|current\s+semester|academic\s+status|cgpa)\s*[:=].*$/i, "")
      .trim()
      .replace(/[|,;]+$/g, "");
    const normalized = normalizeIdentity(candidate);
    if (normalized) names.add(normalized);
  }
  return [...names];
}

function extractSyntheticIds(text: string): string[] {
  const ids = new Set<string>();
  const pattern = /\bsynthetic(?:\s+student)?\s+id\s*[:=]\s*([a-z0-9][a-z0-9-]{2,})/gi;
  for (const match of text.matchAll(pattern)) {
    const normalized = normalizeIdentity(match[1]);
    if (normalized) ids.add(normalized);
  }
  return [...ids];
}

function looksLikeIndividualAcademicRecord(text: string): boolean {
  const hasRecordLabel =
    /\b(?:synthetic\s+demonstration\s+record|not\s+an\s+official\s+marksheet|synthetic\s+marksheet|marksheet|academic\s+transcript|transcript|report\s+card|statement\s+of\s+marks|academic\s+record|student\s+result\s+sheet)\b/i.test(text);
  const hasStudentIdentityLabel =
    /\b(?:student\s+name|student\s+id|synthetic\s*(?:student\s*)?id|user\s*id)\s*[:=]/i.test(text);
  const hasGpaValue =
    /\b(?:synthetic\s+)?(?:cgpa|sgpa|gpa)\s*[:=]\s*\d/i.test(text);
  const hasGradeOrResultValue =
    /\b(?:grade|marks?|result|status)\s*[:=]\s*(?:[a-f][+-]?|o|p|s|u|passed|failed|in\s+progress|\d)/i.test(text);
  const hasCourseResultTable =
    /\bcourse\s+code\b/i.test(text) && /\b(?:passed|failed|in\s+progress)\b/i.test(text);
  const hasResultData = hasGpaValue || hasGradeOrResultValue || hasCourseResultTable;

  return hasResultData && (hasRecordLabel || hasStudentIdentityLabel);
}

/**
 * Preserves an uploaded individual academic record only when its labelled full
 * student name and labelled synthetic ID both match the authenticated session.
 * Missing, conflicting or ambiguous ownership is redacted.
 */
export function sanitizeAttachmentForPrivacy(
  rawText: string,
  student: AttachmentPrivacyIdentity,
): string {
  const text = String(rawText || "");
  if (!text || isPrivacyRedactedAttachment(text)) return text;

  // Image-analysis output is JSON-serialized; normalize escaped line breaks so
  // the same labelled-field checks apply to text, PDFs and images.
  const searchableText = text
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\\"/g, '"');

  if (!looksLikeIndividualAcademicRecord(searchableText)) return text;

  const names = extractStudentNames(searchableText);
  const syntheticIds = extractSyntheticIds(searchableText);
  const expectedName = normalizeIdentity(student.name);
  const expectedId = normalizeIdentity(student.synthetic_student_id);

  const ownershipVerified =
    Boolean(expectedName && expectedId) &&
    names.length === 1 &&
    syntheticIds.length === 1 &&
    names[0] === expectedName &&
    syntheticIds[0] === expectedId;

  return ownershipVerified ? text : ATTACHMENT_PRIVACY_REDACTION;
}
