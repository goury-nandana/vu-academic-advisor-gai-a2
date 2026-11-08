# VU Academic Advisor — DATA308 Generative AI Assignment 2

A multimodal B.Tech-only academic advising prototype for Vidyashilp University. The production-facing app is a Next.js web chat hosted on Vercel. A legacy Streamlit implementation is also retained in the repository for the original academic-data workflow.

**Production web chat:** https://vu-academic-advisor-gai-a1.vercel.app/  
**Repository:** https://github.com/goury-nandana/vu-academic-advisor-gai-a2

## Production web architecture

- **Frontend:** Next.js 15, React 19 and TypeScript.
- **Hosting:** Vercel; project root is frontend/.
- **Backend:** same-origin Next.js API routes at POST /api/chat and POST /api/transcribe.
- **LLM provider:** Groq API. The GROQ_API_KEY is read server-side and must never be exposed via NEXT_PUBLIC_*.
- **Answer model:** openai/gpt-oss-120b.
- **Image model:** qwen/qwen3.8-27b.
- **Audio transcription:** whisper-large-v3-turbo.
- **Read Aloud:** browser Speech Synthesis API.
- **Retrieval:** keyword-weighted official-website/document retrieval plus exact structured B.Tech course-record lookup. The web route is not a dense-vector embedding database.

Configure Vercel with Framework = Next.js, Root Directory = frontend, Install Command = npm ci, Build Command = npm run build. Add GROQ_API_KEY as a server-side Production and Preview environment variable.

## Academic knowledge and retrieval

The web route imports two data exports:

- frontend/data/vu-academic-knowledge.json — Student Handbook, Student SOP, course-plan and minor-workbook passages, plus 205 structured B.Tech semester-spread course records.
- frontend/data/vu-website-knowledge.json — chunked official VU webpage content used for programme, admissions, faculty and campus questions.

Structured course records retain course code, title, L-T-P, credits, prerequisite, semester, admission batch, track where present, source workbook and cell coordinates. Detailed B.Tech semester-spread coverage is for admission batches 2022–2026. The 2022–2025 files do not identify a named track in their source metadata; the application does not infer one. Some non-B.Tech programme curriculum and minor offerings are not available in the supplied structured records, so the advisor must say when it cannot verify them.

Minor-course data is batch-specific. A minor listed in a workbook is not a promise that the course will run in a particular semester. When the answer states the Handbook's minimum-registration threshold, the web route now includes a separate Handbook citation.

## Multimodal features

The web chat supports:

- Text questions and conversational follow-ups.
- PDF, DOCX, XLSX, PPTX, TXT, Markdown and CSV document uploads.
- Image upload and image understanding.
- Audio recording and voice-note transcription.
- Read Aloud using browser Speech Synthesis.
- Structured charts, steps and visual summary cards derived from retrieved answer evidence.
- An authenticated, source-grounded course-prerequisite SVG infographic that shows Passed / Failed / Unknown direct prerequisite states for the signed-in synthetic account.

The web API limit is four files and 4 MB combined. Extraction is in memory. Scanned or encrypted files may not yield readable text; the app should disclose this rather than guess. The chat and transcription routes also require a signed synthetic-account session; transcription checks the expected active profile ID.

## Synthetic B.Tech demo accounts and signup (Assignment 2)

The account screen supports **Log in** and a signup-style activation flow for the ten pre-provisioned demo accounts. Enter the username shown below. The shared classroom-demo password is `1234` for all ten accounts; it is intentionally public and weak, and must never be reused for real accounts.

| Username | Fictional student | Password | Scenario |
|---|---|---|---|
| VU001 | Aarohi Menon | `1234` | Semester 1 — first-semester, in-progress courses |
| VU002 | Ananya Rao | `1234` | Semester 2 — clean progression |
| VU003 | Meera Nair | `1234` | Semester 3 — backlog in DATA103 |
| VU004 | Kavya Iyer | `1234` | Semester 4 — incomplete/unknown result data |
| VU005 | Diya Sharma | `1234` | Semester 5 — high CGPA, strong progression |
| VU006 | Isha Kulkarni | `1234` | Semester 6 — failed course affecting prerequisite |
| VU007 | Nandita Bose | `1234` | Semester 7 — repeated course |
| VU008 | Rhea Pillai | `1234` | Semester 8 — pending course and backlog |
| VU009 | Saanvi Krishnan | `1234` | Graduated profile — completed record |
| VU010 | Tara Desai | `1234` | Semester 6 — multiple backlogs / complex progression |

**Signup behavior:** signup lets the evaluator choose one pre-provisioned scenario and activate its session. It does not create a permanent custom account or persist a new student profile; the repository has no durable account database. The demo password is intentionally shared and public; never use these demo accounts for real data.

Account hashes remain server-side (PBKDF2-SHA256). Session identity and academic context for `/api/chat` and the marksheet endpoint are derived from the signed HttpOnly, SameSite=Strict session cookie, not a browser-submitted profile ID. Logout clears the cookie.

Each authenticated profile can download a **synthetic marksheet PDF** from the Student Account sidebar. It contains semester-wise fictional course rows, synthetic grades/statuses, CGPA and credit totals, and is clearly labelled as a fictional Assignment 2 artifact — not an official university marksheet. The PDF endpoint returns 401 when no authenticated session is present.

All ten profiles are in `frontend/data/synthetic-students.json`. Curriculum course codes, titles, semesters, credits and admission batches are aligned to the repository's structured B.Tech dataset. Student names, grades, CGPAs and academic outcomes are fictional.

After login, try “What is my name?”, “What courses did I have in Semester 1?”, “Which courses did I fail?”, “How many credits have I completed?”, or “Can I take COMP302?”. A graduated profile should be treated as completed rather than as a current registration candidate.

The deterministic workflow in `frontend/academic-agents.ts` runs six specialist stages: synthetic student profile, course retrieval, credit calculation, direct prerequisite check, source verification and limited recommendation. This is a controlled specialist-stage workflow, not six independent autonomous LLM agents. It does not connect to real student records, register a course, approve eligibility or replace a Faculty Advisor/Registrar.
## Privacy and security

- The prototype is not connected to Digiicampus or VU student records.
- Student profile fields are optional and are provided by the person using the chat.
- Questions, profile details and uploaded files are sent to Groq for the requested inference. Do not enter passwords, student IDs or sensitive personal records.
- The prototype does not save chat history in a VU student database or its own permanent server-side chat database. Clear Chat clears the current browser conversation only; it cannot undo data already processed by the provider.
- A downloadable response-evidence JSON export is not currently implemented. If you capture a response for the report, manually redact any synthetic account details before sharing it.
- Chat and transcription routes reject mismatched browser Origin hosts and check declared request sizes. These are useful safeguards, not user authentication or distributed abuse protection.
- Retrieved documents and webpages are treated as untrusted evidence, not instructions.
- Vercel SSO deployment protection is preserved. It is not a substitute for institutional student authentication.

The privacy/security review is in docs/PRIVACY_SECURITY_AUDIT.md. It is a source-code review plus deterministic checks, not a live penetration test or legal compliance certification. Provider retention/region/contract terms, per-student authentication, rate limiting, abuse controls and independent testing require further institutional action.

## Copyright / legal review evidence

docs/LEGAL_COPYRIGHT_OUTPUT_REVIEW.md evaluates three actual saved advisor outputs captured on 4 November 2026: an undergraduate programme list, a Calculus course-code lookup and a B.Tech 2022 minor-options answer. The saved transcript did not preserve original model identifiers or timestamps per response. The review records that evidence gap and identifies a missing Handbook citation in the older minor response; the current route has been corrected to cite that policy separately.

The document is an educational risk review, not legal advice or blanket permission to reproduce university material. It also documents prospective copyright/consent safeguards for image, audio, and video generation; those media types are not among the three actual text outputs reviewed. The frontend does not currently provide a downloadable response-evidence export. VU approval is required before commercial use of university content, student data or third-party materials.

## Agentic academic-advising workflow

The authenticated synthetic-account chat includes a six-stage deterministic specialist workflow for course eligibility questions: student-profile retrieval, batch-matched course retrieval, completed-credit calculation, prerequisite checking, source verification and a limited recommendation. The UI exposes the executed stages and explains how this differs from the ordinary RAG-only answer path. The workflow is validated against all ten synthetic login profiles; it does not make official enrolment decisions. See [the workflow design, account scenarios and RAG-only comparison](docs/AGENT_PIPELINE_AND_MODEL_COMPARISON.md).

## Model benchmark status

benchmark_runner.py supports a three-model comparison:
- openai/gpt-oss-20b
- openai/gpt-oss-120b
- qwen/qwen3.8-27b

It expects VU_LLM_Benchmark_Framework.xlsx, which is not in the repository. No complete scored model comparison or model ranking is claimed. The benchmark also requires a configured GROQ_API_KEY and must be run where that secret is authorised. The model displayed in an individual chat turn is the model used for that turn, not a model-comparison result.

## Local development and tests

Python checks from the repository root:

    python -m py_compile app.py course_data.py advisor_guardrails.py upload_support.py benchmark_runner.py
    python -m unittest discover -s tests -v

Next.js checks from frontend/:

    npm ci
    npm run typecheck
    npm run build
    npm run dev

GitHub Actions runs Python and frontend checks on pushes and pull requests to main.

## Assignment 2 documentation and viva pack

- [System architecture and data-flow boundaries](docs/ARCHITECTURE.md)
- [Multimodal feature implementation and limitations](docs/MULTIMODAL_EXTENSION.md)
- [Agent workflow and RAG-only comparison](docs/AGENT_PIPELINE_AND_MODEL_COMPARISON.md)
- [Privacy and security audit](docs/PRIVACY_SECURITY_AUDIT.md)
- [Legal/copyright review of three actual outputs](docs/LEGAL_COPYRIGHT_OUTPUT_REVIEW.md)
- [Viva demonstration guide and synthetic account scenarios](docs/VIVA_DEMO_GUIDE.md)
- [Test evidence and release status](docs/TESTING_AND_RESULTS.md)
- [Assignment 2 final report and Phase 8–12 gap analysis](docs/ASSIGNMENT_2_FINAL_REPORT.md)

## Remaining production requirements

Before real students' confidential records are enabled, VU must approve the purpose, privacy notice, provider agreement, identity integration and data-retention rules. A production integration would require authorised VU/vendor SSO or APIs, minimum data scopes, server-side authorisation, deletion and retention controls, distributed rate limits, security logging, incident response, cross-user isolation tests and independent penetration testing.

The current system is a working educational prototype, not a production-authorised student-record system.
