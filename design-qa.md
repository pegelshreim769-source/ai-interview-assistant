# Design QA — 简历工作台参考图还原

- Source visual truth: `/var/folders/vc/gdzh6wps7f31n6lwt9bmbw1r0000gn/T/codex-clipboard-4f4142ae-c46c-407c-a88a-b78ec2462a91.png`
- Implementation screenshot: `/tmp/resume-studio-qa/resume-studio-desktop-1692-final.png`
- Full-view comparison: `/tmp/resume-studio-qa/resume-studio-side-by-side-final.png`
- Focused hero / methodology / workflow comparison: `/tmp/resume-studio-qa/resume-studio-focus-hero-method-workflow.png`
- Focused upload comparison: `/tmp/resume-studio-qa/resume-studio-focus-upload-section.png`
- Viewport: 1692 × 930 desktop; responsive behavior also checked at 1089 × 1062 and 390 × 844
- State: empty initial workspace, first workflow step current, primary action disabled until both inputs contain text

## Findings

No actionable P0/P1/P2 differences remain.

- Fonts and typography: the existing Chinese system font stack is retained. The 42px two-line hero, compact eyebrow, 14px body copy, method card hierarchy, workflow labels, and upload headings reproduce the reference hierarchy without clipped text.
- Spacing and layout rhythm: the desktop sidebar is 300px; the main content begins at x=410 and is 1172px wide. The hero is 190px high, the methodology card is 482px wide, and the Beta notice, workflow, status strip, and upload card follow the source's vertical sequence and card radii.
- Colors and visual tokens: the page uses a restrained navy / low-saturation blue palette, warm white surfaces, pale blue-gray backgrounds, subtle borders, and light elevation. The active step and selected navigation item have sufficient contrast.
- Image quality and asset fidelity: the existing brand mark is retained. A dedicated student avatar and methodology-folder illustration were generated as raster assets and are loaded directly from `public/resume-studio/`; both render at their intended crops without transparency halos or placeholder shapes.
- Copy and content: the source headline and methodology copy are restored. Privacy and evidence-first language remain aligned to the live product's truthful-resume constraints. The upload copy accurately reflects the existing file-size limit and paste behavior.
- Icons: navigation and upload icons use the existing Phosphor icon library with a consistent 18–29px stroke scale.
- Responsiveness: at 390px the sidebar becomes a compact header, the hero and methodology card stack, the workflow scrolls horizontally, and the page has no body-level horizontal overflow.
- Accessibility: upload textareas retain explicit labels, focus styling is visible, file controls remain reachable, the primary action retains its existing disabled logic, and generated images include alt text.

## Interaction Checks

- “新建一轮” clears the current local workspace and returns to the empty state.
- Resume and JD textareas remain editable and accept paste input.
- Existing file inputs and extraction handlers remain connected.
- “生成事实台账” remains disabled until both resume and JD text are present.
- Workflow state descriptions continue to use live fact, planning, rewrite, validation, and finalization data.
- Desktop and mobile pages have no body-level horizontal overflow; the workflow is intentionally scrollable at narrow widths.
- Browser console: no application errors.

## Comparison History

1. Initial implementation used a compact header, collapsed visual hierarchy, 232px sidebar, and description-less workflow. These were P1 composition mismatches.
2. Rebuilt the page around the reference's 300px sidebar, two-column hero, 482px methodology card, descriptive seven-step workflow, status strip, and document-style upload panels.
3. The first screenshot-led pass still had a 286px sidebar, a narrow methodology card, an off-screen sidebar footer, and an intermittently unloaded avatar. These were P2 fidelity issues.
4. Corrected the desktop geometry to x=410 / 1172px, made the sidebar viewport-sticky, switched the raster assets to direct loading, and rechecked the same 1692 × 930 empty state.
5. Final full-view and focused comparisons show no remaining P0/P1/P2 mismatch.

## Follow-up Polish

- P3: the reference's notification/help/avatar utility cluster is not reproduced; the existing theme controls are preserved to avoid introducing non-functional product controls.
- P3: the reference's upgrade promotion is replaced by a truthful-resume principle card so the sidebar remains consistent with the product's current functionality.
- P3: the reference shows an enabled primary button in its empty mockup; the implementation intentionally preserves the real disabled-until-input logic.

## Shared Workspace Follow-up — 2026-07-20

- Target: extend the approved Resume Studio shell to `/`, `/mock-interview`, and `/custom-interview`, while making the top-right sidebar control switch between “简历工作台” and “面试 Lab”.
- Desktop viewport: 1440 × 900 for all four routes.
- Mobile viewport: 390 × 844 for the custom-interview flow and workspace menu.
- Visual comparison: the Resume Studio screen remained the visual source of truth; each Interview Lab route was captured in the same 1440 × 900 browser session and compared for sidebar geometry, light palette, hero hierarchy, notice/workflow rhythm, card treatment, button treatment, and content width.

### Follow-up Findings

- Resume Studio now exposes only its own sidebar entry. The three interview-mode entries are not rendered in that workspace.
- The workspace switcher presents exactly two desktop options: “面试 Lab” and “简历工作台”. The selected workspace has a check state and both options navigate successfully.
- “面试 Lab” contains the existing 文字练习、模拟面试、定制面试 navigation. Active-state highlighting and all original route targets remain intact.
- Text, mock, and custom interview pages now share the Resume Studio 300px sidebar, low-saturation blue, white cards, pale background, light borders, 12–16px radii, compact hero, privacy strip, and light horizontal workflow treatment.
- Existing text composer, mock-interview controls, custom material inputs, history handlers, and primary button logic remain connected.
- At 390px, the sidebar becomes a compact header. The workspace menu spans the safe content width and adds three mode shortcuts so Interview Lab navigation remains available when the desktop sidebar is hidden.
- No body-level horizontal overflow was found on the four desktop routes or the checked mobile route.
- Browser console: no application errors.

### Annotation Fixes

- Removed the “系 / 浅 / 深” appearance control from the shared layout. All four routes now report zero `.appearance-dock` elements and retain the approved light workspace palette.
- Repositioned the desktop workspace menu inside the sidebar viewport. At 1280 × 960 it measures 264px wide from x=18 to x=282 within the 300px sidebar and does not intersect the hero heading.
- Rechecked the mobile menu at 390 × 844: it spans x=8 to x=382, exposes both workspaces plus the three Interview Lab shortcuts, and causes no body-level horizontal overflow.

No actionable P0/P1/P2 differences remain in this follow-up.

final result: passed

## 精简工作流复核 — 2026-07-21

- Source visual truth: `/var/folders/vc/gdzh6wps7f31n6lwt9bmbw1r0000gn/T/codex-clipboard-26755561-0dab-4415-85e5-e61bec05d54d.png`
- Desktop screenshot: `/tmp/resume-studio-compact-qa/resume-studio-desktop-full.png`
- Confirmed-ledger screenshot: `/tmp/resume-studio-compact-qa/resume-studio-facts-desktop.png`
- Mobile screenshots: `/tmp/resume-studio-compact-qa/resume-studio-mobile.png` and `/tmp/resume-studio-compact-qa/resume-studio-mobile-viewport.png`
- Side-by-side comparison: `/tmp/resume-studio-compact-qa/resume-studio-qa-comparison.png`
- Viewports: 1366 × 900 desktop and 390 × 844 mobile
- States: initial materials, confirmed read-only evidence ledger, generated writing plan

### Findings

No actionable P0/P1/P2 differences remain.

- Information architecture: the workspace shell stays outside the task flow. The page now presents five task steps matching the requested workflow: materials and parsing, evidence ledger, writing plan, rewrite-strategy confirmation, and downloadable delivery.
- Confirmation behavior: resume and JD corrections are confirmed once. The evidence ledger is generated from that confirmed material and remains read-only, removing the repeated per-fact confirmation loop.
- Evidence density: the ledger shows six compact one-line summaries by default. Each row expands in place for its excerpt, dates, metrics, and fixed-fact state; a single control reveals the full list.
- Validation: evidence and metric validation still runs before finalization but no longer appears as a separate user-facing step. Blocking issues remain visible inside the rewrite-strategy stage.
- Delivery: the final stage exposes copy, PDF, and DOCX actions after the existing authenticity confirmation and keeps the custom-interview handoff.
- Responsiveness: the document and body widths remain 390px at the mobile viewport; the five-step list is the only horizontally scrollable region (`clientWidth: 372px`, `scrollWidth: 800px`). Cards stack without clipped controls or body-level horizontal overflow.
- Visual system: the approved warm-white, pale-blue, navy, light-border, and restrained-shadow system is preserved. Existing Phosphor icons and raster brand assets remain unchanged.
- Accessibility and interaction: evidence rows use native `details/summary`; the full-list control and plan CTA are semantic buttons; final download actions keep disabled states until authenticity is confirmed.

### Interaction Checks

- “试试示例” loads fully fictional resume and JD content.
- “确认材料并生成事实台账” advances once and produces seven evidence records.
- The first evidence row expands and reveals its source excerpt and structured fields.
- “查看全部 7 条事实” switches the compact list from six to seven rows.
- “生成简历撰写规划” advances successfully to the writing-plan state.
- Browser console: no application errors.

final result: passed
