# Implementation Plan: Declutter Confirmation Modal with Expandable Execution Details

Declutter `ConfirmModal.tsx` so that operators are greeted with a compact, minimal summary of the switch action (Target Host, Managed Service, Current Profile & Target Profile), while technical execution details (Verification Probe, Timeout, Pipeline Script Steps, and Fail-Fast warning) are cleanly tucked into a collapsible accordion section.

---

## User Preferences & Requirements
1. **Presentation Style**: An expandable accordion section labelled **"Execution Details"** embedded directly within the confirmation modal.
2. **Initial State**: **Collapsed by default** for an uncluttered, compact dialog.
3. **Information in Main/Default View**:
   - Header with title and close button
   - High-level switch summary:
     - Target Host (with OS badge)
     - Managed Service name
     - Current Profile
     - Target Profile (highlighted with arrow indicator)
   - Operational Safety Lock Notice (HTTP 409 mutex explanation)
   - Action buttons ("Cancel" and "Confirm & Execute Pipeline")
4. **Information Moved into Collapsible "Execution Details" Accordion**:
   - Verification Probe command / probe service name
   - Total Pipeline Timeout & step count
   - Sequential Script Pipeline preview (numbered steps, script path, parameters, individual step timeouts)
   - Fail-Fast Test Mode warning (if active)

---

## Proposed Changes

### `src/components/ConfirmModal.tsx`
- Add local state: `const [showExecutionDetails, setShowExecutionDetails] = useState(false);`
- Reset `showExecutionDetails` to `false` when modal opens or closes.
- Use `ChevronDown` / `ChevronRight` (or `ChevronUp`) from `lucide-react` for a smooth, accessible toggle button.
- Format the accordion:
  - Header button: `Execution Details` with a step count pill (e.g. `2 steps · 360s`), chevron icon, and accessible `aria-expanded` attributes.
  - Body: Contains the verification probe command, timeout, sequential script steps, and fail-fast warning.
- Maintain responsive, high-contrast light and dark theme styling (`dark:bg-slate-900`, `border-slate-200 dark:border-slate-800`).

---

## Verification Plan
1. **Compilation & Linting**:
   - Run `compile_applet` and `lint_applet` (`tsc --noEmit`).
2. **Interaction Verification**:
   - Open confirmation modal from FleetView: verify dialog is compact, minimal, and only shows Host, Service, Current Profile -> Target Profile, and Lock Notice.
   - Click "Execution Details" accordion: verify it smoothly expands to show Probe, Timeout, Pipeline Steps, and Fail-Fast details.
   - Toggle accordion closed/open: verify smooth toggling.
   - Confirm profile switch execution: verify job starts and streams normally.
   - Verify styling across both Light Mode and Dark Mode.
