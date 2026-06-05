# Manual visual smoke checklist — target UI parity pass

Use this checklist after a local frontend build/dev run. Do not commit screenshot binaries.

## Shell and header
- [ ] Light theme: compact app shell, product header, cards, text contrast, and borders look balanced.
- [ ] Dark theme: compact app shell, product header, cards, text contrast, and borders look balanced.
- [ ] Header shows the target product title/subtitle plus one contextual JSON Analyzer/Curl Executor action and theme control.
- [ ] Header/action/theme controls wrap cleanly at desktop, tablet, and narrow widths without exposing MVP/PDF/Rust/job architecture copy.

## JSON Analyzer layout and results
- [ ] JSON Input and Analysis Results form a target-like two-column layout on desktop and stack cleanly on narrow widths.
- [ ] Input card status, textarea, flatten option, and Load Example/Format/Clear actions remain readable in light and dark themes.
- [ ] Results idle/loading/error/success states keep Analyze JSON/Try Again/Re-analyze/Clear Results hierarchy clear.
- [ ] Exactly three result tabs are visible: Statistics, Values, Duplicates.
- [ ] Statistics tab keeps summary metrics, statistics, structure, fields, and min/max sections readable.
- [ ] Active, hover, focus-visible, disabled/loading, and error states are visually distinct and do not rely on color alone.

## Values Explorer
- [ ] Field dropdown opens above surrounding content, supports search, and shows selected counts/limit feedback clearly.
- [ ] Dropdown option hover, selected, disabled, and limit-reached states are readable in light and dark themes.
- [ ] Values filter controls, sort, page size, parent/source details, and summary metrics wrap without crowding.
- [ ] Grouped values table highlights duplicate value groups while keeping all columns/data visible via horizontal overflow instead of clipping.
- [ ] Source paths, record indexes, capped parent/source item details, empty states, disabled feature state, warnings, and pagination controls remain readable at narrow widths.
- [ ] Values does not mount or link to a separate advanced duplicate workflow; grouped-value duplicate insights stay inside Values Explorer.

## Duplicates
- [ ] Exact duplicates summary/groups render with readable metrics and table overflow behavior.
- [ ] Duplicates remains exact-only: no field/composite duplicate picker, filter controls, Find Duplicates action, or advanced workflow is visible.
- [ ] Exact duplicate tables keep all columns/data visible via horizontal overflow instead of clipping.

## Curl Executor
- [ ] Instructions, secure preview note, Curl Command section, mode controls, and run controls follow the target task flow.
- [ ] Curl input, batch input, parsed preview, guardrail/auth panels, warnings, and errors are readable in light and dark themes.
- [ ] Response/status panels, code blocks, and tables preserve readable contrast and usable horizontal/vertical scrolling.
- [ ] Batch controls, large-batch confirmation, job progress, cancellation disabled state, and narrow viewport wrapping remain usable.
