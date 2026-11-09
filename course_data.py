"""Structured B.Tech course data loader for the VU Academic Advisor.

Reads the original semester-spread workbooks directly. It deliberately does not
infer missing fields or use the separate programme-structure sheets as semester
records. Source workbook and cell coordinates are retained for traceability.
"""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import re
from zipfile import ZipFile

from openpyxl import load_workbook

DATA_ARCHIVE = Path(__file__).resolve().parent / "VU_Semester_Data_Split.zip"
SEMESTER_FILES = {
    "2022": "01_Semester_Spread_BTech_2022.xlsx",
    "2023": "02_Semester_Spread_BTech_2023.xlsx",
    "2024": "03_Semester_Spread_BTech_2024.xlsx",
    "2025": "04_Semester_Spread_BTech_2025.xlsx",
    "2026": "05_Semester_Spread_BTech_DS_2026.xlsx",
}
CODE_RE = re.compile(r"^[A-Za-z]{2,6}\s*[-]?\s*\d{3,4}[A-Za-z]?$")


def _clean(value):
    return re.sub(r"[\s-]", "", str(value or "")).upper()


def load_course_records(archive_path=DATA_ARCHIVE):
    """Return validated course rows from all supported semester-spread workbooks."""
    archive_path = Path(archive_path)
    if not archive_path.is_file():
        raise FileNotFoundError(f"Required curriculum archive not found: {archive_path.name}")

    records = []
    with ZipFile(archive_path) as archive:
        available = set(archive.namelist())
        for batch, filename in SEMESTER_FILES.items():
            if filename not in available:
                raise FileNotFoundError(f"{filename} is missing from {archive_path.name}")
            workbook = load_workbook(BytesIO(archive.read(filename)), data_only=True, read_only=False)
            sheet = workbook.active
            semester_columns = {}
            for col in range(1, sheet.max_column + 1):
                marker = _clean(sheet.cell(1, col).value).upper()
                if re.fullmatch(r"S[1-8]", marker):
                    semester_columns[marker] = col

            if set(semester_columns) != {f"S{i}" for i in range(1, 9)}:
                raise ValueError(f"Semester headers incomplete in {filename}: {sorted(semester_columns)}")

            for row in range(3, sheet.max_row + 1):
                basket_code = _clean(sheet.cell(row, 1).value)
                basket_name = _clean(sheet.cell(row, 2).value)
                for sem_label, title_col in semester_columns.items():
                    code_col = title_col - 1
                    raw_code = _clean(sheet.cell(row, code_col).value)
                    raw_title = sheet.cell(row, title_col).value
                    title = re.sub(r"\s+", " ", str(raw_title or "")).strip()
                    if not raw_code or not title or not CODE_RE.fullmatch(raw_code):
                        continue

                    prereq = _clean(sheet.cell(row, title_col + 1).value)
                    l_val = sheet.cell(row, title_col + 2).value
                    t_val = sheet.cell(row, title_col + 3).value
                    p_val = sheet.cell(row, title_col + 4).value
                    credits = sheet.cell(row, title_col + 5).value
                    coords = {
                        "code": sheet.cell(row, code_col).coordinate,
                        "title": sheet.cell(row, title_col).coordinate,
                        "prerequisite": sheet.cell(row, title_col + 1).coordinate,
                        "L": sheet.cell(row, title_col + 2).coordinate,
                        "T": sheet.cell(row, title_col + 3).coordinate,
                        "P": sheet.cell(row, title_col + 4).coordinate,
                        "credits": sheet.cell(row, title_col + 5).coordinate,
                    }
                    course_code = re.sub(r"\s+", "", raw_code).upper()
                    track = "Data Science" if batch == "2026" else None
                    record = {
                        "is_course_record": True,
                        "document_type": "semester_spread",
                        "course_code": course_code,
                        "course_title": title,
                        "prerequisite": prereq,
                        "L": l_val,
                        "T": t_val,
                        "P": p_val,
                        "credits": credits,
                        "semester": int(sem_label[1:]),
                        "programme": "B.Tech",
                        "track": track,
                        "batch": batch,
                        "basket": {"code": basket_code or None, "name": basket_name or None},
                        "source": filename,
                        "cells": coords,
                    }
                    record["text"] = (
                        f"{course_code} — {title}. B.Tech admission batch {batch}; "
                        f"semester {record['semester']}; credits {credits}; "
                        f"prerequisite {prereq or 'not specified'}; "
                        f"L-T-P {l_val}-{t_val}-{p_val}."
                    )
                    records.append(record)
            workbook.close()

    if not records:
        raise ValueError("No course records were extracted from the semester-spread workbooks.")

    # Duplicate course rows in the same batch/semester are retained only if the
    # source locations differ; the source coordinate is part of record identity.
    seen = set()
    unique = []
    for record in records:
        identity = (record["batch"], record["semester"], record["course_code"], record["cells"]["code"])
        if identity not in seen:
            seen.add(identity)
            unique.append(record)
    return unique


def normalize_course_code(value):
    """Normalize a course code without changing its letters or digits."""
    return re.sub(r"[\s-]", "", str(value or "")).upper()


def extract_course_codes(question):
    """Extract exact 3- or 4-digit course-code tokens without partial matches."""
    pattern = re.compile(r"(?<![A-Za-z0-9])[A-Za-z]{2,6}[\s-]?\d{3,4}[A-Za-z]?(?![A-Za-z0-9])")
    return list(dict.fromkeys(normalize_course_code(x) for x in pattern.findall(str(question or ""))))


def course_records_for_question(question, records, batch=None):
    """Return structured rows for exact course codes mentioned in a question.

    Shared by the Streamlit advisor and benchmark harness. Callers should
    place these records before generic handbook/course-plan chunks.
    """
    codes = set(extract_course_codes(question))
    if not codes:
        return []
    return [
        dict(record) for record in records or []
        if normalize_course_code(record.get("course_code")) in codes
        and (batch is None or str(record.get("batch")) == str(batch))
        and record.get("document_type") == "semester_spread"
        and record.get("is_course_record")
    ]
