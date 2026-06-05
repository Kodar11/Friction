# Phase 1: Stabilize Architecture — Implementation Plan

## Overview
Your architecture is already solid. This plan focuses on hardening the service lifecycle, adding observability, and ensuring config sync reliability.

---

## Fix 1: `src/service/install.cts` — Proper Stop/Wait/Delete/Wait Flow

### Current Issue
- Relies on `alreadyinstalled` event from node-windows
- Doesn't explicitly stop service before uninstall
- No delay between stop and delete (Windows SCM needs time)

### New Flow
```
1. sc query FrictionService → check if exists
2. If exists:
   a. sc stop FrictionService
   b. Wait 3 seconds
   c. sc delete FrictionService
   d. Wait 3 seconds
3. Install fresh via node-windows
4. Start service
5. Verify running (sc query → RUNNING)
```

### Code Changes
- Add `isServiceRegistered()` using `sc query`
- Add `stopService()` using `sc stop`
- Add `deleteService()` using `sc delete`
- Add `sleep()` helper for delays
- Add `verifyRunning()` to confirm service started
- Convert to async main() with proper sequential flow

---

## Fix 2: `src/electron/elevation.ts` — Path Resolution

### Current Issue
- Line 28: Uses `.cjs` extension but source is `.cts`
- In dev mode, `app.getAppPath()` returns project root, not dist
- `dist-electron` might not be built in dev

### Fix
- Check for both `.cjs` (production) and `.js` (dev/transpiled) extensions
- Add fallback to `process.cwd()` for dev mode
- Log the resolved path for debugging

---

## Fix 3: Structured Logging — `[UI]` and `[SERVICE]` Prefixes

### Files to Modify
- `src/electron/main.ts` — Add `[UI]` prefix to all logger calls
- `src/electron/ipc.ts` — Add `[UI]` prefix to all logger calls
- `src/service/index.ts` — Already uses `source: 'service'`, verify log format
- `src/service/runtime.ts` — Verify log messages are clear
- `src/service/scheduler.ts` — Verify log messages are clear

### Log Format
```
[UI] Config saved
[UI] Service install requested
[UI] Active flipped: true
[SERVICE] Started
[SERVICE] Config changed
[SERVICE] Hosts updated: 5 entries
[SERVICE] DNS flushed
```

---

## Fix 4: Config Sync Verification

### Add to `src/shared/statusFile.ts`
```typescript
interface ServiceHeartbeat {
  // ... existing fields ...
  configVersion: number;  // Incremented each time service reloads config
  lastConfigSyncAt: number;  // Timestamp of last successful config load
}
```

### Add to `src/electron/configStore.ts`
- Add a `sequenceNumber` field to config that increments on each write
- Service reads this and echoes back in heartbeat

### UI Verification
- UI polls heartbeat and checks if `configVersion` matches expected
- If stale after 10s, show "Config sync pending" indicator

---

## Fix 5: Enhance Heartbeat

### Add to `src/service/heartbeat.ts`
```typescript
private startTime = Date.now();

// In write():
uptimeMs: Date.now() - this.startTime,
lastConfigSyncAt: this.lastConfigSyncAt,
lastHostsWriteAt: this.lastHostsWriteAt,
```

### Track in `src/service/runtime.ts`
- Set `lastConfigSyncAt` when config watcher fires
- Set `lastHostsWriteAt` when scheduler applies hosts

---

## Fix 6: Validation/Self-Test Mode

### Create `src/service/selfTest.ts`
Run the 5 tests programmatically:

1. **Service survives UI close**
   - Install service
   - Kill Electron process
   - Wait 120s
   - Check hosts file updated

2. **Service survives reboot**
   - (Manual test — document steps)

3. **Config sync**
   - Write config change
   - Poll heartbeat for configVersion match
   - Verify within 10s

4. **No duplicate services**
   - `sc query FrictionService`
   - Parse output for single instance

5. **Permission validation**
   - Run UI without admin
   - Verify UI still works
   - Verify service handles hosts writes

### Output
Write results to `AppData/Friction/logs/self-test-results.json`

---

## Implementation Order

1. `install.cts` — Stop/wait/delete/wait flow
2. `elevation.ts` — Path resolution fix
3. Structured logging prefixes
4. Config sync verification
5. Heartbeat enhancement
6. Self-test mode
7. Run tests

---

## Testing Checklist

After implementation:

- [ ] `npm run transpile:electron` succeeds
- [ ] `npm run service:install` completes without errors
- [ ] `sc query FrictionService` shows RUNNING
- [ ] Close Electron → wait 2 min → hosts file still updates
- [ ] Change schedule in UI → hosts updates within 60s
- [ ] `sc query FrictionService` shows single instance
- [ ] UI runs without admin, service handles blocking
- [ ] Logs show `[UI]` and `[SERVICE]` prefixes
- [ ] Heartbeat includes uptime and config sync timestamps
