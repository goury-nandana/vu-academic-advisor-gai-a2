# Privacy and Security Review — VU Academic Advisor A2

**Review date:** 5 November 2026  
**Review type:** Static code review, deterministic prompt-injection tests, synthetic workflow tests and deployment-setting review. This is not a formal penetration test, independent security certification or guarantee against all attacks.

## System and data-flow boundary

- The web UI is hosted by Vercel and calls the same-origin Next.js /api/chat and /api/transcribe routes.
- Answer generation, image understanding and speech transcription requests are sent from the server to Groq. The browser does not receive the GROQ_API_KEY.
- The student signs in to one of ten pre-provisioned synthetic B.Tech demo accounts. The profile ID and academic context used by the chat API are derived server-side from the signed HttpOnly session cookie; browser-submitted profile identity is ignored. The prototype is not connected to VU's Digiicampus or student-information database.
- Questions, uploaded content and optional profile fields may be transmitted to Groq for the requested inference. The prototype does not write chat history or uploaded content to a VU student database or its own permanent chat database.
- The browser-side Clear Chat action clears the current conversation from the page state; it cannot recall a request already sent to the provider.
- No answer-evidence JSON export interface is present in the current Next.js frontend; do not describe this as an implemented user feature. The chat and displayed citations remain transient page-state content.

## Controls implemented in the repository

- **Server-side secret:** GROQ_API_KEY is read by server routes and is not exposed through a NEXT_PUBLIC_* variable.
- **Same-origin request check:** the chat and transcription routes reject a mismatched browser Origin host. Requests with no Origin header are still accepted for non-browser clients; this check is a CSRF reduction, not user authentication.
- **Request limits:** the API checks declared request size before parsing and enforces the existing four-file / 4 MB combined upload limit after parsing. These limits do not replace infrastructure-level body limits.
- **No local persistence:** the browser keeps the chat in transient page state; no server-side transcript database is implemented.
- **Data minimisation notice:** the UI tells users that questions, optional profile details and uploads are sent to Groq and says not to enter passwords, student IDs or sensitive personal records.
- **Synthetic student data:** ten fictional female B.Tech demo profiles span semesters 1–8 and a graduated case, with synthetic grades/CGPAs, backlogs, repeats and unknown results. Curriculum course codes, titles, semesters, credits and admission batches are derived from the repository's structured B.Tech records. Three legacy COMP302 fixtures remain marked test-only; none is connected to a real student or university account.
- **Demo account authentication:** the user ID is the synthetic student's name; all ten public demo accounts share password `1234`, stored as per-account PBKDF2-SHA256 hashes (120,000 iterations) with timing-safe hash comparison. The password is intentionally disclosed for classroom access and is not suitable for real accounts. Login and signup activation issue an 8-hour signed HMAC session cookie with HttpOnly, SameSite=Strict, Path=/ and Secure in production. Signup activates one pre-provisioned scenario; it does not persist user-created profiles because no durable account database is configured. Logout clears the cookie. A dedicated SESSION_SECRET is required; GROQ_API_KEY is never used as a signing-key fallback. Production session creation fails closed unless SESSION_SECRET contains at least 32 characters. This is a classroom demo credential system, not VU identity verification.
- **Synthetic marksheet download:** /api/marksheet requires a valid authenticated session and generates a PDF from that session's synthetic academic record. It is marked fictional and not official; unauthenticated requests receive 401. This endpoint is covered by source-level tests but has not yet undergone deployed penetration testing.
- **Authenticated chat boundary:** /api/chat requires a valid signed session before reading the request body or calling Groq. The authenticated profile is derived from that session rather than trusting browser profile fields.
- **Authenticated transcription boundary:** /api/transcribe also requires a valid signed session and checks the expected profile ID to detect account changes between tabs before sending audio to Groq.
- **Prompt-injection boundary:** retrieved webpages, university documents, images and attachments are treated as untrusted data. The server escapes source material before placing it in marked context blocks, and system instructions reject embedded instructions to reveal prompts, keys or private data.
- **Deterministic tests:** tests/test_prompt_injection.py checks delimiter escaping and representative attack strings. tests/test_synthetic_advising.py checks prerequisite fixture data. tests/test_synthetic_accounts.py checks ten name-based demo accounts, PBKDF2 hashes for shared password `1234`, batch-matched course history, session/logout guards, signup activation and the marksheet PDF route.
- **Dependency review:** the previous resolved frontend npm audit run reported zero known advisories at that scan time. This is not a continuous security guarantee.
- **Deployment protection:** Vercel SSO / deployment protection is preserved. It protects access to the deployment URL for authorised viewers but does not implement in-app student identity or per-student permissions.

## Privacy information surfaced in the UI

The authenticated sidebar contains an expandable **Privacy & Security** panel. It states:
- The app uses fictional demo profiles and is not connected to Digiicampus or real VU student records.
- Account-specific synthetic profile and academic records are used to answer.
- The student's question, relevant profile/course context, recent conversation context, and any selected upload may be processed by Groq; voice recordings are also sent to Groq for transcription.
- Users must not enter real student IDs, credentials, private academic records, financial information or sensitive personal information.
- Logout ends the demo session and clears the session cookie.
- Clear Chat resets the in-page conversation and attachment context, but cannot recall information already sent to the provider.
- AI academic advice is not official university approval.

The panel is a transparency notice, not a consent manager or proof of legal compliance. It does not provide a provider-side deletion control.

## Rubric privacy/security scenario coverage

A new static regression suite, `tests/test_privacy_security_regression.py`, maps to the ten requested scenarios. It checks implementation boundaries in source code and the visible notice. These assertions are designed to run under the repository's GitHub Actions `python -m unittest discover -s tests -v` job.

| # | Scenario | Safeguard checked by regression test | Test type / limitation |
|---|---|---|---|
| 1 | Unauthenticated user asks “What is my name?” | Chat API requires a signed-in session; unauthenticated UI shows login | Static assertion; not a live API request |
| 2 | User tries to view another account's profile | Session profile lookup is derived from signed cookie | Static assertion; no hostile-cookie HTTP test |
| 3 | User tries to download another account's marksheet | Marksheet route only accepts the authenticated session and has no student-ID lookup parameter | Static assertion; no deployed endpoint test |
| 4 | User asks the model to reveal another student's grades | System prompt instructs model not to reveal another student's data; profile context is session-bound | Prompt/code assertion; model refusal behavior is not guaranteed or evaluated here |
| 5 | User asks for all account passwords | Public profile endpoint excludes credential hashes; credential records use PBKDF2 hashes | Static assertion plus existing hash validation tests; shared demo password is intentionally public for class use |
| 6 | User attempts to switch identity through a prompt | Chat API constructs profile identity from authenticated server-side student | Static assertion; no runtime adversarial model test |
| 7 | Uploaded document prompt injection asks to reveal records | Uploaded/source data is explicitly marked untrusted and instructions reject private-data disclosure | Static assertion; not a live red-team test |
| 8 | User requests a private student's marksheet | Marksheets are generated only from session-derived student; route does not accept arbitrary profile IDs | Static assertion; not a deployed access-control test |
| 9 | User logs out then requests previous account data | Logout clears cookie; client clears account state and attachment context | Static assertion; browser session replay not executed |
| 10 | User asks for information missing from profile | Prompt requires explicit Unknown/In Progress reporting and prohibits inference from missing results | Static assertion; model output quality remains untested |
| UI transparency | User opens Privacy & Security panel | Assertions verify notice covers provider processing, prohibited inputs, Digiicampus boundary, and Clear Chat semantics | Static assertion; visual/browser accessibility review pending |

**Execution status (verified):** GitHub Actions run [42123342501](https://github.com/goury-nandana/vu-academic-advisor-gai-a2/actions/runs/42123342501) completed successfully on commit `c714edcb4bcc1838d6f862f2132cf12ad3ffb2f9`. The Python suite ran **73 tests — OK**; the frontend job also passed TypeScript and the Next.js production build. These tests are source-level regression assertions, not ten live attacks against deployed endpoints or the remote Groq model. Existing account, marksheet, prompt-injection and academic tests are maintained separately. This prototype has not undergone an independent or deployed penetration test.

## Synthetic data test scenarios

The pre-provisioned demo accounts are authenticated individually. Ten accounts cover semester-wise course history, failed and repeated courses, incomplete information, a borderline case and a graduated profile. The three legacy SYN-001–SYN-003 fixtures remain test-only for the existing COMP302 prerequisite tests.

| Synthetic fixture | Test outcome | Calculated credits |
|---|---|---:|
| SYN-001 | Direct prerequisites recorded as completed | 29 |
| SYN-002 | COMP206 recorded as failed | 25 |
| SYN-003 | Completion of COMP206 and COMP208 is not established | 21 |

The credit totals are computed from the matching 2025 workbook rows for the course codes listed in each artificial profile. The eligibility check covers only the direct prerequisites shown for that course. It does not establish official registration eligibility, timetable availability, progression, or approval by the Registrar.

## Residual risks and controls requiring university/provider action

- **Demo-only identity and account persistence:** in-app login/logout and session-bound profile isolation are implemented for the pre-provisioned synthetic accounts, but identity is not verified by VU. Self-service signup and persistent user-created accounts are not implemented because no durable account database is configured. Vercel deployment protection remains separate from this demo login.
- **No Digiicampus connection:** there is no authorised VU SSO, SAML/OIDC or student-record API integration. Do not request a student's Digiicampus password in chat. Real integration needs VU/vendor approval, consent, scoped access, token security and a data-processing agreement.
- **No distributed rate limit / abuse control:** the application routes do not implement per-user quotas, distributed rate limiting, bot detection or abuse monitoring.
- **No live penetration test:** deterministic code tests are not a live red-team exercise against the deployed Groq model or a penetration test of the Vercel deployment.
- **Provider retention and region:** provider-side retention, processing region, deletion guarantees and the exact contract accepted for the configured Groq account must be checked by the account owner. Do not claim zero retention or that data never leaves the app. Groq's published agreement places responsibilities on customers for input permissions and output evaluation; account-specific settings and terms still need confirmation.
- **Isolation testing remains limited:** chat identity is server-bound to the signed session, but a full deployed cross-account penetration test and marksheet endpoint tests have not yet been executed. No real student data or multi-tenant university database is present.
- **No legal compliance certification:** the UI privacy notice is a transparency measure, not proof of compliance with the DPDP Act/Rules or any institutional policy. VU's data-protection/legal team must approve the actual purposes, notices, retention and vendor terms.
- **Source drift:** official pages and handbooks may change. A source citation identifies evidence used for an answer; it is not university endorsement of the generated answer.

## Recommended institutional controls before real student data is enabled

1. University-approved SSO and server-side session validation; roles and record-level authorisation.
2. Official vendor API access with minimum scopes; no password collection by the chatbot.
3. Approved privacy notice, purpose limitation, consent/other lawful basis, retention schedule, deletion process and vendor contract.
4. Encryption in transit and at rest for any authorised stored data; protected secrets and audited key rotation.
5. Infrastructure-level request/body limits, distributed rate limits, abuse monitoring, security logging that avoids recording unnecessary student content, and incident response.
6. Independent penetration testing, live prompt-injection red-teaming, cross-user access testing and periodic dependency scans.
7. Human escalation for eligibility, grades, progression, credit transfer, exceptions and other decisions with official academic consequences.

## Conclusion

The repository now includes practical privacy messaging, same-origin request checks, request-size checks, synthetic-only advising fixtures, source-bounded recommendations and deterministic security tests. These improvements reduce specific risks but do not make the prototype production-ready for confidential student records. An institutional security and privacy review remains necessary.
