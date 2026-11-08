# Implementation Plan: Single-Profile Command Execution (No Redundant Dropdown)

## Overview
When a managed service has only one profile defined (e.g. `svc-fin-restart` with its single `"Restart"` profile and no `active_profile_path`), selecting a profile from a dropdown is redundant. We will hide the dropdown list completely and replace the "Switch Profile" button with a dedicated **"Execute"** button featuring a **Play icon** and a sky accent background.

---

## Changes

### 1. Update `FleetView.tsx`
- Determine if the service has a single profile: `const isSingleProfile = service.profiles.length === 1;`
- For single-profile services:
  - Automatically select the sole profile (`service.profiles[0].name`) so execution is ready immediately without requiring prior selection.
  - **Hide the `<select>` dropdown entirely**.
  - Show the action button with:
    - Text: **`Execute`** (when unlocked)
    - Icon: `<Play className="w-3.5 h-3.5 fill-current" />`
    - Background: `bg-sky-600 hover:bg-sky-500 text-white shadow-sm`
- For multi-profile services:
  - Retain the dropdown selector and existing "Switch Profile" button.
- Ensure transitioning / locked states (`<Lock /> Locked`, disabled click) work identically for single-profile and multi-profile services.

### 2. Update `mockOrchestrator.ts` & Local Sync
- Add the `svc-fin-restart` service to `INITIAL_SERVICES` in `src/services/mockOrchestrator.ts` so client-side fallback remains in sync with the updated `config.yaml`.

### 3. Update `ConfirmModal.tsx`
- When a service has only 1 profile or has no `current_profile`:
  - Show `Action / Profile:` instead of `Target Profile:`, or adapt the transition row so it doesn't look like a profile swap if `current_profile` is absent.
  - The confirm button says `Confirm & Execute Pipeline`.

---

## Verification Plan
1. **Compilation & Linting**:
   - Run `compile_applet` and `lint_applet` (`tsc --noEmit`).
2. **UI Verification**:
   - Verify that `svc-fin-restart` on `win-prod-01` displays **no dropdown**.
   - Verify the action button reads **"Execute"** with a **Play icon** in sky accent.
   - Verify clicking "Execute" opens the confirmation modal for the `"Restart"` pipeline and displays the steps (`Stop service`, `Start service`).
   - Verify confirming starts the pipeline and streams execution logs to the drawer cleanly.
   - Verify multi-profile services (like `svc-fin-router` and `svc-edge-proxy`) retain their dropdowns and "Switch Profile" buttons unchanged.
