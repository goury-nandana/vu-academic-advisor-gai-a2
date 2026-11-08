"""Regression coverage for the recent Vikki Talk transcript defects.

These tests check deterministic source contracts and the synthetic dataset. They
are not deployed HTTP/browser tests or tests of Groq model quality.
"""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ROUTE = (ROOT / "frontend/app/api/chat/route.ts").read_text(encoding="utf-8")
TRANSCRIBE = (ROOT / "frontend/app/api/transcribe/route.ts").read_text(encoding="utf-8")
ADVISOR = (ROOT / "frontend/app/advisor.ts").read_text(encoding="utf-8")
PAGE = (ROOT / "frontend/app/page.tsx").read_text(encoding="utf-8")
KNOWLEDGE = json.loads((ROOT / "frontend/data/vu-academic-knowledge.json").read_text(encoding="utf-8"))
WEBSITE = json.loads((ROOT / "frontend/data/vu-website-knowledge.json").read_text(encoding="utf-8"))
STUDENTS = json.loads((ROOT / "frontend/data/synthetic-students.json").read_text(encoding="utf-8"))


def normalize_like_route(question: str) -> str:
    """Mirror the intentionally small typo map used before intent routing."""
    replacements = {
        "attendace": "attendance",
        "faled": "failed",
        "naything": "anything",
        "ocurses": "courses",
        "structre": "structure",
        "eleigible": "eligible",
        "reqiremnet": "requirement",
    }
    for typo, correction in replacements.items():
        question = re.sub(r"\b" + re.escape(typo) + r"\b", correction, question, flags=re.IGNORECASE)
    return question


class TranscriptRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.kavya = next(row for row in STUDENTS["students"] if row.get("username") == "VU004")
        cls.batch_rows = [
            row for row in KNOWLEDGE["courseRecords"]
            if str(row.get("batch")) == "2025"
            and str(row.get("programme", "")).lower() == "b.tech"
            and row.get("document_type") == "semester_spread"
            and row.get("is_course_record") is not False
        ]

    def test_common_typos_are_normalized_before_routing(self):
        self.assertIn("function normalizeAcademicTypos", ROUTE)
        self.assertIn("normalizeAcademicTypos(pendingMinorQuestion", ROUTE)
        self.assertEqual(normalize_like_route("have i faled naything?"), "have i failed anything?")
        self.assertEqual(normalize_like_route("list all the ocurses i am yet to complete"), "list all the courses i am yet to complete")

    def test_attendance_percentage_uses_75_and_65_thresholds_and_discloses_80_clause(self):
        self.assertIn("attendancePolicyAnswer(academicMatches,effectiveQuestion)", ROUTE.replace(" ", ""))
        self.assertIn("percentage < 65", ROUTE)
        self.assertIn("percentage < 75", ROUTE)
        self.assertIn("attendance requirement of 80", ROUTE)
        handbook = [d for d in KNOWLEDGE["documents"] if "Student Handbook" in str(d.get("source", ""))]
        self.assertTrue(any(re.search(r"(?:seventy five percent|75\s*%)", d.get("text", ""), re.I) for d in handbook))
        self.assertTrue(any(re.search(r"(?:sixty five percent|65\s*%)", d.get("text", ""), re.I) for d in handbook))
        self.assertTrue(any(re.search(r"attendance requirement of 80\s*%", d.get("text", ""), re.I) for d in handbook))

    def test_failed_course_typo_reaches_deterministic_profile_handler(self):
        normalized = normalize_like_route("have i faled naything?")
        self.assertRegex(normalized, r"have i failed anything")
        self.assertIn("asksFailedCourses", ROUTE)
        self.assertIn("have i failed any(?:thing|course|courses)", ROUTE)

    def test_current_courses_ltp_uses_the_authenticated_batch_plan(self):
        self.assertIn("asksCurrentSemesterCourses", ROUTE)
        self.assertIn("requestedSemester=explicitRequestedSemester", ROUTE.replace(" ", ""))
        sem4 = {row["course_code"]: (row.get("L"), row.get("T"), row.get("P")) for row in self.batch_rows if row.get("semester") == 4}
        self.assertEqual(len(sem4), 6)
        self.assertEqual(sem4["UCOR205"], (2, 1, 0))
        self.assertEqual(sem4["MATH206"], (0, 0, 4))
        self.assertEqual(sem4["COMP207"], (2, 0, 2))
        self.assertEqual(sem4["COMP301"], (3, 0, 2))
        self.assertEqual(sem4["COMP205"], (2, 0, 2))
        self.assertEqual(sem4["MATH301"], (3, 1, 0))

    def test_kavya_outstanding_course_audit_separates_unknown_in_progress_and_future(self):
        self.assertIn("asksAllRemainingCourses", ROUTE)
        self.assertIn("remainingCoursesAnswer", ROUTE)
        completed = set(self.kavya["completed_course_codes"])
        records = {row["course_code"]: row for row in self.kavya["academic_records"]}
        outstanding = [row for row in self.batch_rows if row["course_code"] not in completed and records.get(row["course_code"], {}).get("status") != "Passed"]
        unknown = [row for row in outstanding if row["course_code"] in self.kavya["unknown_course_codes"]]
        in_progress = [row for row in outstanding if records.get(row["course_code"], {}).get("status") == "In Progress"]
        upcoming = [row for row in outstanding if row["course_code"] not in records and row["semester"] > self.kavya["current_semester"]]
        self.assertEqual((len(outstanding), len(unknown), len(in_progress), len(upcoming)), (20, 1, 6, 13))
        self.assertEqual({row["course_code"] for row in unknown}, {"MATH209"})

    def test_generative_ai_is_not_present_in_kavya_batch_plan_and_is_not_given_invented_prerequisites(self):
        self.assertFalse(any(re.search(r"generative\s*ai", str(row.get("course_title", "")) + " " + str(row.get("course_code", "")), re.I) for row in self.batch_rows))
        page_chunks = [row for row in WEBSITE["chunks"] if row.get("page_id") == "programme_btech_aiml"]
        self.assertTrue(any("Generative AI models" in row.get("text", "") for row in page_chunks))
        self.assertIn("generativeAiElectiveAnswer", ROUTE)
        self.assertIn("Do not assume COMP301", ROUTE)
        self.assertIn("cannot confirm that you are eligible", ROUTE)

    def test_transcription_requires_the_same_authenticated_session_as_chat(self):
        self.assertIn("getAuthenticatedStudent(request)", TRANSCRIBE)
        self.assertIn("if (!authenticatedStudent)", TRANSCRIBE)
        self.assertIn("status: 401", TRANSCRIBE)
        self.assertIn("x-expected-profile-id", TRANSCRIBE)
        self.assertIn("transcribeVoice(recordingFile, authStudent?.id)", PAGE)
        self.assertNotIn("EXTERNAL_API", ADVISOR)
        self.assertIn('const endpoint = "/api/chat"', ADVISOR)

    def test_groq_rate_limit_message_does_not_expose_raw_provider_error(self):
        self.assertIn("PROVIDER_RATE_LIMITED", ROUTE)
        self.assertIn("The advisor is temporarily at capacity", ROUTE)
        self.assertIn('console.error("[VU Academic Advisor] Answer generation failed"', ROUTE)


if __name__ == "__main__":
    unittest.main()
