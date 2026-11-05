# Implementation Plan: Declutter Service Details & Enrich HostDetailsModal

## Overview
Declutter the managed service rows in `FleetView` to present a minimalist, high-impact operator interface while enriching the `HostDetailsModal` with the full suite of service metadata (active profile, verification probe, active profile file path, and service type). Also remove the "Fail-Fast Test" checkbox from the service action bar.

---

## Changes Breakdown

### 1. Enrich `HostDetailsModal.tsx`
Enhance the **"Managed Services on Host"** section in `src/components/HostDetailsModal.tsx` so that operators can inspect full service details when clicking the host's Info icon:
- **Service Name & ID**
- **Status Badge**: `Running` / `Locked`
- **Active Profile**: Current active profile pill or `None` if unconfigured
- **Verification Probe**: Name of the probe service (`verification_service_name`)
- **Active Profile Path**: Path to the server-side text file (`active_profile_path`), if configured
- **Service Type**: System type (`windows_service`, `systemd`, `generic_process`)
- **Available Profiles**: Number of defined profiles and steps

### 2. Declutter Service Rows in `FleetView.tsx`
- **Remove Service Metadata Row**:
  - Remove `current_profile` indicator
  - Remove `verification_service_name` probe indicator
  - Remove `active_profile_path` file indicator
  - Remove `service_type` indicator
- **Retain in Service Row**:
  - Service display name (`service.name`)
  - Real-time status badge (`RUNNING`, `TRANSITIONING (LOCKED)`, `PROBE FAILED`)
  - Description text (`service.description`)
- **Remove Fail-Fast Test Checkbox**:
  - Remove the checkbox label `<input type="checkbox" ... /> Fail-Fast Test`
  - Remove `simulateFailures` state from `FleetView.tsx`
  - Default `simulateFailure: false` when calling `onInitiateSwitch`
- **Clean up Action Bar**:
  - Keep the profile selection dropdown
  - Keep the "Switch Profile" execution button
  - Keep the "Live Stream" button when a service is actively transitioning

### 3. Update `App.tsx` & `ConfirmModal.tsx`
- Keep `ConfirmModal` cleanly working with `simulateFailure` set to `false`.
- Ensure `onInitiateSwitch` in `FleetView` matches the updated signature `(host, service, targetProfile)` or keeps `simulateFailure?: boolean`.

---

## Verification Plan
1. **Compilation & Lint**:
   - Run `compile_applet` and `lint_applet` (`tsc --noEmit`).
2. **UI & Usability Verification**:
   - Verify that service rows in `FleetView` only show the name, status badge, description, dropdown, and switch button.
   - Verify that the "Fail-Fast Test" checkbox is completely removed.
   - Verify that clicking the Host's Info icon opens the modal showing all service metadata (current profile, verification probe, profile path, service type).
   - Verify that initiating and confirming a profile switch operates smoothly.
