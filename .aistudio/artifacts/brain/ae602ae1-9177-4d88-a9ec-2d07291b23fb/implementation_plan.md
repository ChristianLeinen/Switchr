# Implementation Plan: Dark Mode & Light Mode Theme Toggle

Add a seamless dark/light theme toggle to the Switchr DevOps dashboard that supports system preference detection with persistent operator overrides, placed in the top navigation header.

## User Preferences & Requirements
1. **Toggle Placement**: In the top navigation header next to telemetry badges.
2. **Terminal Styling**: Keep the live execution terminal drawer and log view in dark terminal theme for realism and high contrast even when light mode is active.
3. **Default Behavior**: Respect the user's OS system color preference (`prefers-color-scheme`) by default, and remember explicit toggle actions in `localStorage` under `'switchr-theme'`.
4. **Cohesive Appearance**: Clean, modern enterprise DevOps styling in light mode (crisp slate/zinc surfaces, dark borders, high-contrast badges) matching the dark console aesthetic.

---

## Proposed Changes

### 1. Theme Management System
- Create a dedicated hook/context or custom state manager in `src/hooks/useTheme.ts`:
  - Detects initial theme from `localStorage.getItem('switchr-theme')` or `window.matchMedia('(prefers-color-scheme: dark)')`.
  - Dynamically sets or removes the `dark` class on `document.documentElement` (`<html>`).
  - Listens to system theme change events if no manual preference is saved.
  - Exposes `theme: 'dark' | 'light'` and `toggleTheme()`.

### 2. Styling System & Tailwind Configuration (`src/index.css`)
- Configure `:root` and `.dark` variables or CSS utility overrides for backgrounds, text, and crisp scrollbars.
- Ensure light mode body has `#f8fafc` (slate-50) background with `#0f172a` (slate-900) primary text, and dark mode retains `#090d16` with `#e2e8f0`.

### 3. Header Component (`src/components/Header.tsx`)
- Add Sun / Moon toggle button next to `DRY_RUN=True` badge and `Test 409 Lock` button.
- Include tooltip / aria-label indicating "Switch to light mode" or "Switch to dark mode".
- Adapt header background and borders to `bg-white/90 border-slate-200 text-slate-900` in light mode and `bg-[#070b14]/95 border-slate-800/80 text-white` in dark mode.

### 4. Fleet & Audit Views (`src/components/FleetView.tsx`, `src/components/AuditHistoryView.tsx`)
- Update host cards, search inputs, filter buttons, badges, and tables to use Tailwind `dark:` variants:
  - Cards: `bg-white border-slate-200 text-slate-900 shadow-sm dark:bg-[#0c1220] dark:border-slate-800 dark:text-slate-100`.
  - Badges & tags: maintain high contrast in both themes.
  - Buttons: clear primary action contrast in both modes.

### 5. Modals & Popups (`src/components/ConfirmModal.tsx`, `src/components/LegalModal.tsx`)
- Adapt modal containers to look crisp in light mode (`bg-white border-slate-200 text-slate-800 shadow-2xl`) while retaining rich dark styling in dark mode.

### 6. Terminal Drawer Preservation (`src/components/TerminalDrawer.tsx`)
- Per the user's explicit preference, maintain the dark terminal aesthetic (`bg-[#05070e]`, green/sky/amber terminal logs) even when the app is in light mode.

### 7. Footer Component (`src/components/Footer.tsx`)
- Adapt footer borders, text colors, and legal link hovers for light and dark modes.

---

## Verification Plan
1. **Automated Verification**:
   - Run `compile_applet` to check TypeScript compilation.
   - Run `lint_applet` (`tsc --noEmit`) to verify no type or import errors.
2. **Behavioral Testing**:
   - Verify toggle changes the `dark` class on `<html>` and updates `localStorage`.
   - Verify reloading the page retains the user's selected theme.
   - Verify terminal drawer stays in high-contrast dark theme in both modes.
   - Verify modal dialogs (Switch Confirmation, Legal popups) display cleanly in both themes.
