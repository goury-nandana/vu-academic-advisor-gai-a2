function normalizeCode(value: unknown): string {
  return String(value ?? "").replace(/[\s-]/g, "").toUpperCase();
}

export type ParsedPrerequisites = {
  /** All course codes present in the source expression, de-duplicated in source order. */
  codes: string[];
  /** Slash-separated groups whose logical meaning is not defined by the supplied workbook. */
  ambiguousSlashGroups: string[][];
};

/**
 * Parses comma- and semicolon-separated prerequisite codes.
 * A slash-separated group is extracted as individual course codes but remains marked
 * ambiguous because the workbook does not state whether "/" means AND or OR.
 */
export function parsePrerequisiteExpression(value: unknown): ParsedPrerequisites {
  const raw = String(value ?? "").trim();
  if (!raw || /^(?:nil|none|na|n\/a|-)$/i.test(raw)) {
    return { codes: [], ambiguousSlashGroups: [] };
  }

  const codes: string[] = [];
  const ambiguousSlashGroups: string[][] = [];
  const sections = raw.split(/[,;]+/);

  for (const section of sections) {
    const found = (section.match(/\b[A-Z]{2,}\s*-?\s*\d{3,}\b/gi) || [])
      .map(normalizeCode)
      .filter(Boolean);
    const unique = [...new Set(found)];
    if (!unique.length) continue;
    unique.forEach((code) => {
      if (!codes.includes(code)) codes.push(code);
    });
    if (section.includes("/") && unique.length > 1) {
      ambiguousSlashGroups.push(unique);
    }
  }

  return { codes, ambiguousSlashGroups };
}
