import type { SyntheticStudentProfile } from "./demo-auth";

function ascii(value: unknown): string {
  return String(value ?? "—")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E]/g, "?");
}
function pdfEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}
function drawLine(text: string, y: number, size = 9, bold = false): string {
  const font = bold ? "F2" : "F1";
  return `BT /${font} ${size} Tf 42 ${y} Td (${pdfEscape(ascii(text))}) Tj ET\n`;
}
function makePage(lines: Array<{ text: string; size?: number; bold?: boolean }>): string {
  let y = 795;
  let stream = "";
  for (const line of lines) {
    stream += drawLine(line.text, y, line.size ?? 9, line.bold ?? false);
    y -= line.size && line.size >= 14 ? 25 : 15;
  }
  return stream;
}
export function createSyntheticMarksheetPdf(student: SyntheticStudentProfile, selectedSemester?: number): Buffer {
  const sourceRecords = student.academic_records || [];
  const attemptRows = sourceRecords.flatMap((record) => {
    const attempts = Array.isArray(record.attempts) && record.attempts.length
      ? [...record.attempts].sort((a, b) => Number(a.semester) - Number(b.semester))
      : [{ semester: record.semester, grade: record.grade, status: record.status }];
    return attempts.map((attempt, index) => ({
      semester: Number(attempt.semester),
      course_code: record.course_code,
      course_title: record.course_title,
      credits: Number(record.credits || 0),
      grade: attempt.grade,
      status: attempt.status,
      attemptNumber: index + 1,
    }));
  }).filter((row) => selectedSemester === undefined || row.semester === selectedSemester)
    .sort((a, b) => a.semester - b.semester || a.course_code.localeCompare(b.course_code) || a.attemptNumber - b.attemptNumber);

  const passedStatus = (status: unknown) => ["passed", "passed on repeat"].includes(String(status || "").trim().toLowerCase());
  const passedCredits = selectedSemester === undefined
    ? [...new Map(sourceRecords.filter((record) => passedStatus(record.status))
        .map((record) => [record.course_code.replace(/[\s-]/g, "").toUpperCase(), Number(record.credits || 0)])).values()]
        .reduce((sum, credits) => sum + credits, 0)
    : [...new Map(attemptRows.filter((row) => passedStatus(row.status))
        .map((row) => [row.course_code.replace(/[\s-]/g, "").toUpperCase(), row.credits])).values()]
        .reduce((sum, credits) => sum + credits, 0);
  const attemptedCredits = attemptRows.reduce((sum, row) => sum + row.credits, 0);
  const generatedDate = new Date().toISOString().slice(0, 10);
  const semesterCreditTotals = attemptRows.reduce((totals, row) => {
    const semester = String(row.semester);
    totals[semester] = (totals[semester] || 0) + row.credits;
    return totals;
  }, {} as Record<string, number>);
  const semesterTotalsLabel = Object.keys(semesterCreditTotals).sort((a, b) => Number(a) - Number(b)).map((semester) => semester + ": " + semesterCreditTotals[semester] + " credits").join(" | ");
  const tableHeader = "SEM  COURSE CODE  COURSE TITLE                              CR  GRADE      RESULT  ATTEMPT";
  const tableRows = attemptRows.map((row) => {
    const sem = String(row.semester).padStart(2, " ");
    const code = ascii(row.course_code).padEnd(12).slice(0, 12);
    const title = ascii(row.course_title).padEnd(40).slice(0, 40);
    const credits = String(row.credits).padStart(2, " ");
    const grade = ascii(row.grade || "Not provided").padEnd(10).slice(0, 10);
    const status = ascii(row.status);
    return `${sem}   ${code} ${title} ${credits}  ${grade} ${status}  ${row.attemptNumber}`;
  });
  const pages: Array<Array<{ text: string; size?: number; bold?: boolean }>> = [];
  const intro: Array<{ text: string; size?: number; bold?: boolean }> = [
    { text: "VIDYASHILP UNIVERSITY", size: 15, bold: true },
    { text: "SYNTHETIC DEMONSTRATION RECORD - NOT AN OFFICIAL MARKSHEET", size: 9, bold: true },
    { text: "Assignment 2 | Fictional student record", size: 9, bold: true },
    { text: "Generated date: " + generatedDate, size: 9 },
    { text: "User ID / Student name: " + student.name, size: 10, bold: true },
    { text: "Synthetic ID: " + student.synthetic_student_id + "    Programme: " + student.programme },
    { text: "Admission batch: " + student.admission_batch + "    Current semester: " + (student.current_semester === null ? "Graduated" : student.current_semester) },
    { text: "Academic status: " + (student.current_semester === null || /graduat/i.test(student.academic_status || "") ? "GRADUATED" : (student.academic_status || "Not provided")) + "    Synthetic CGPA: " + (student.synthetic_cgpa ?? "Not provided") },
    { text: (selectedSemester === undefined ? "Cumulative completed credits" : "Semester " + selectedSemester + " passed credits") + " (unique course codes passed): " + passedCredits },
    { text: "Credits across displayed attempts (repeat attempts counted separately): " + attemptedCredits, size: 8 },
    { text: "Attempt credits by semester: " + semesterTotalsLabel, size: 8 },
    { text: "Numeric marks not provided; synthetic grade values are displayed from the profile.", size: 8 },
    { text: "All grades, CGPA and outcomes shown here are fictional test data." },
    { text: tableHeader, size: 8, bold: true },
  ];
  const firstPageRows = 36;
  pages.push([...intro, ...tableRows.slice(0, firstPageRows).map((text) => ({ text, size: 7 }))]);
  for (let start = firstPageRows; start < tableRows.length; start += 42) {
    pages.push([
      { text: "SYNTHETIC DEMO MARKSHEET - CONTINUED", size: 13, bold: true },
      { text: "Student: " + student.name + "    Synthetic ID: " + student.synthetic_student_id, size: 9 },
      { text: "Fictional data only; not an official university record.", size: 9, bold: true },
      { text: tableHeader, size: 8, bold: true },
      ...tableRows.slice(start, start + 42).map((text) => ({ text, size: 7 })),
    ]);
  }
  if (attemptRows.length === 0) {
    pages[0].push({ text: "No course records are present in this synthetic profile." });
  }
  const pageStreams = pages.map(makePage);
  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [" + pages.map((_, i) => `${5 + i * 2} 0 R`).join(" ") + "] /Count " + pages.length + " >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  pages.forEach((_, i) => {
    const contentId = 6 + i * 2;
    const pageId = 5 + i * 2;
    const stream = pageStreams[i];
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}endstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
  });
  let output = "%PDF-1.4\n%Synthetic marksheet PDF\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(output, "ascii");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) output += String(offsets[id]).padStart(10, "0") + " 00000 n \n";
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}
