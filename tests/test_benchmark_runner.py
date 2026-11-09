"""Regression tests for benchmark model selection and workbook validation."""
import tempfile
import unittest
from pathlib import Path

from benchmark_runner import CANDIDATE_MODELS, read_questions, validate_available_models


class BenchmarkRunnerTests(unittest.TestCase):
    def test_available_candidate_subset_is_accepted(self):
        available = CANDIDATE_MODELS[:2]
        self.assertEqual(validate_available_models(available), available)

    def test_empty_candidate_list_fails_with_actionable_message(self):
        with self.assertRaisesRegex(RuntimeError, "None of the configured candidate models"):
            validate_available_models([])

    def test_three_configured_models_do_not_trigger_a_ten_model_requirement(self):
        self.assertEqual(len(validate_available_models(CANDIDATE_MODELS)), 3)

    def test_missing_private_workbook_has_actionable_error(self):
        missing = Path(tempfile.gettempdir()) / "VU_missing_benchmark_workbook.xlsx"
        if missing.exists():
            missing.unlink()
        with self.assertRaisesRegex(RuntimeError, "not included in this repository"):
            read_questions(missing)


if __name__ == "__main__":
    unittest.main()
