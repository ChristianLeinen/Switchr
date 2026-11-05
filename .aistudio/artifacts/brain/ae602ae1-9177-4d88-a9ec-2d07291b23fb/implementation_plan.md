# Implementation Plan: Declutter Host Cards & Add Host Details Popup Modal

## Overview
Declutter the host card headers in `FleetView` to give operators a clean, scannable overview while keeping all deep technical connection parameters accessible via a modal popup.

---

## User Specifications & Requirements
1. **Remove from Host Card Header**:
   - IP address / hostname (`host.hostname`)
   - Connection port (`host.port`)
   - Protocol indicator (`WinRM WS-Man` / `Paramiko SSH`)
   - Authentication user information (`User: host.auth.username`)
   - Managed services count text on the right (`{hostServices.length} managed services`)
2. **Retain on Host Card Header**:
   - Host OS badge (`WIN` / `NIX`)
   - Host display name (`host.name`)
   - Host description (`host.description`)
3. **New Trigger**:
   - Place an Info icon button (`Info` from `lucide-react`) on the right side of the host header.
4. **Host Details Popup Modal**:
   - Center modal dialog with backdrop blur.
   - Dismissible via Escape key, close button, or clicking the backdrop.
   - Styled seamlessly for both Light and Dark modes.
   - Displays all connection, protocol, authentication, and inventory details clearly:
     - Host ID & Name
     - Operating System & Remote Transport Protocol (WinRM WS-Management vs Paramiko SSH)
     - IP Address / Hostname & Port (with SSL indicator if applicable)
     - Authentication Type (Password / Key) & Username
     - Credential source (Environment variable / Key path)
     - Managed Services breakdown on this host with status badges

---

## Proposed Changes

### 1. New Component: `HostDetailsModal.tsx`
Create `src/components/HostDetailsModal.tsx`:
- Accepts `host: TargetHost | null`, `services: ManagedService[]`, `isOpen: boolean`, and `onClose: () => void`.
- Includes keyboard listener for `Escape` and background scroll lock while open.
- Displays structured technical cards:
  - **Connection & Protocol**: Hostname, Port, Protocol, Transport type.
  - **Authentication**: Auth type (password/key), username, credential source.
  - **Managed Services**: List of services mapped to this host with status and probe info.
  - **Close button** at top and bottom.

### 2. Update `FleetView.tsx`
- Remove the inline metadata row showing hostname, port, protocol, and username.
- Replace the right-side text `{hostServices.length} managed services` with an Info icon button:
  ```tsx
  <button
    onClick={() => setSelectedHostForDetails(host)}
    title={`View technical details for ${host.name}`}
    className="p-1.5 rounded-md text-slate-500 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
  >
    <Info className="w-4 h-4" />
  </button>
  ```
- Retain the OS badge, host name, and host description in the header.
- Maintain `selectedHostForDetails: TargetHost | null` state and render `<HostDetailsModal />`.

---

## Verification Plan
1. **Compilation & Type Check**:
   - Run `compile_applet` and `lint_applet` (`tsc --noEmit`).
2. **Visual & Interaction Verification**:
   - Verify host cards are clean, displaying only badge, name, and description.
   - Verify clicking the Info icon button opens the center modal with all technical details.
   - Verify modal closes on Escape key, clicking Close, or clicking the backdrop.
   - Verify responsive behavior and styling across both Light and Dark modes.
