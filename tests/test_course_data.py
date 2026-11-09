import unittest

from course_data import load_course_records, course_records_for_question


class CourseDataFidelityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records = load_course_records()

    def test_all_five_supported_batches_are_loaded(self):
        self.assertEqual(
            {str(row["batch"]) for row in self.records},
            {"2022", "2023", "2024", "2025", "2026"},
        )
        self.assertGreaterEqual(len(self.records), 190)

    def test_ucor205_matches_original_batch_specific_rows(self):
        expected = {
            "2022": (3, 3, "NIL", 2, 1, 0),
            "2023": (3, 3, "NIL", 2, 1, 0),
            "2024": (3, 3, "NIL", 2, 1, 0),
            "2025": (4, 3, "Nil", 2, 1, 0),
            "2026": (4, 3, "Nil", 2, 1, 0),
        }
        for batch, (semester, credits, prereq, l_val, t_val, p_val) in expected.items():
            rows = [r for r in self.records
                    if r["course_code"] == "UCOR205" and str(r["batch"]) == batch]
            self.assertEqual(len(rows), 1, f"UCOR205 row count for {batch}")
            row = rows[0]
            self.assertEqual(row["semester"], semester)
            self.assertEqual(row["credits"], credits)
            self.assertEqual(str(row["prerequisite"]).casefold(), prereq.casefold())
            self.assertEqual((row["L"], row["T"], row["P"]), (l_val, t_val, p_val))

    def test_machine_learning_title_is_preserved_and_has_batch_specific_data(self):
        rows = [r for r in self.records if r["course_code"] == "DATA301"]
        self.assertEqual({str(r["batch"]) for r in rows}, {"2022", "2023", "2025", "2026"})
        self.assertTrue(all(r["course_title"].casefold() == "machine learning" for r in rows))
        self.assertTrue(all(r["semester"] == 5 for r in rows))
        self.assertTrue(all(r["credits"] == 4 for r in rows))
        self.assertEqual(
            {str(r["prerequisite"]) for r in rows},
            {"DATA202,MATH301", "DATA206,MATH301"},
        )

    def test_exact_course_code_lookup_retrieves_lt_p_for_t002_wording(self):
        rows = course_records_for_question(
            "What is the L-T-P structure for UCOR205?", self.records
        )
        self.assertEqual({str(row["batch"]) for row in rows},
                         {"2022", "2023", "2024", "2025", "2026"})
        for row in rows:
            self.assertEqual((row["L"], row["T"], row["P"]), (2, 1, 0))
            self.assertIn("UCOR205", row["text"])
            self.assertIn("L-T-P 2-1-0", row["text"])

    def test_exact_course_code_lookup_handles_hyphen_and_batch_filter(self):
        rows = course_records_for_question(
            "What is the L-T-P structure for UCOR-205?", self.records, batch="2026"
        )
        self.assertEqual(len(rows), 1)
        self.assertEqual(str(rows[0]["batch"]), "2026")
        self.assertEqual((rows[0]["L"], rows[0]["T"], rows[0]["P"]), (2, 1, 0))

    def test_course_code_lookup_does_not_match_substrings(self):
        self.assertEqual(
            course_records_for_question("What about XUCOR2050?", self.records), []
        )

    def test_exact_lookup_supports_four_digit_codes_and_optional_suffix(self):
        records = [
            {
                "course_code": "ABCD1234X",
                "batch": "2026",
                "document_type": "semester_spread",
                "is_course_record": True,
                "source": "test.xlsx",
                "cells": {"code": "B2"},
                "text": "ABCD1234X — Test Course.",
            },
        ]
        found = course_records_for_question("Please explain ABCD-1234X.", records)
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["course_code"], "ABCD1234X")

    def test_source_provenance_is_present(self):
        for row in self.records:
            self.assertTrue(row["source"])
            self.assertTrue(row["cells"]["code"])
            self.assertTrue(row["cells"]["title"])
            self.assertEqual(row["document_type"], "semester_spread")
            self.assertTrue(row["is_course_record"])

    def test_track_is_not_inferred_for_earlier_batches(self):
        for row in self.records:
            if str(row["batch"]) in {"2022", "2023", "2024", "2025"}:
                self.assertIsNone(row["track"])
        self.assertEqual(
            {r["track"] for r in self.records if str(r["batch"]) == "2026"},
            {"Data Science"},
        )


if __name__ == "__main__":
    unittest.main()
