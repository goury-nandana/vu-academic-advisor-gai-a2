import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class MultimodalExtensionRegressionTests(unittest.TestCase):
    def test_course_pathway_uses_authenticated_batch_workflow(self):
        route = (ROOT / "frontend/app/api/chat/route.ts").read_text(encoding="utf-8")
        self.assertIn("buildCoursePathwayVisualization(syntheticAgentWorkflow)", route)
        self.assertIn("exact batch-matched workbook records", route)
        self.assertIn("const asksForVisual=", route)
        self.assertIn("|| asksForVisual", route)

    def test_pathway_statuses_are_derived_from_profile_outcomes(self):
        route = (ROOT / "frontend/app/api/chat/route.ts").read_text(encoding="utf-8")
        self.assertIn("result.student.completed_course_codes", route)
        self.assertIn("result.student.failed_course_codes", route)
        self.assertIn('"completed" as const', route)
        self.assertIn('"failed" as const', route)
        self.assertIn('"unknown" as const', route)
        self.assertIn("No direct prerequisite listed", route)

    def test_ui_renders_accessible_svg_not_model_supplied_markup(self):
        page = (ROOT / "frontend/app/page.tsx").read_text(encoding="utf-8")
        self.assertIn('<svg viewBox=', page)
        self.assertIn('role="img"', page)
        self.assertIn('aria-label={`Prerequisite pathway', page)
        self.assertIn('visual.kind === "course-pathway"', page)

    def test_existing_multimodal_inputs_and_read_aloud_remain_wired(self):
        page = (ROOT / "frontend/app/page.tsx").read_text(encoding="utf-8")
        route = (ROOT / "frontend/app/api/chat/route.ts").read_text(encoding="utf-8")
        transcribe = (ROOT / "frontend/app/api/transcribe/route.ts").read_text(encoding="utf-8")
        self.assertRegex(page, r"transcribeVoice\(recordingFile,\s*authStudent\?\.id\)")
        self.assertIn("window.speechSynthesis.speak(utterance)", page)
        self.assertIn("readImages(key,imageFiles,combinedQuestion)", route)
        self.assertIn("OfficeParser.parseOffice", route)
        self.assertIn("whisper-large-v3-turbo", transcribe)


if __name__ == "__main__":
    unittest.main()
