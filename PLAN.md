# Focus Blocker — Project Plan
> **Working name:** Focus Blocker (rename before v1)
> **Status:** Planning complete, build not started
> **Author:** Tanmay Chavan
> **Last updated:** 2026-05-08
---
## 1. Vision
A local-first, OS-level website blocker that helps people build discipline through environmental friction. Users define a daily schedule and named site groups; the app activates blocking automatically based on that schedule. Hard enough to bypass that it disrupts impulsive autopilot, simple enough that a non-technical user can install and configure it.
**This is not a productivity timer. This is not Cold Turkey clone #47. The product is the friction.**
---
## 2. Goals & Non-Goals
### Goals
- Ship a polished, trustworthy v1 in 4 weeks
- Open-source, MIT-licensed, public on GitHub
- Function as portfolio piece demonstrating systems thinking
- Genuinely useful to non-technical users
- Cross-platform-ready architecture (Windows v1, Mac/Linux v1.1)
### Non-Goals (explicitly out of scope for v1)
- Application-level blocking (only websites)
- Mobile apps
- Cloud sync / accounts / login
- Browser extensions
- Telemetry / analytics
- Pomodoro / focus timer features
- Defeating advanced bypasses (VPN, DNS-over-HTTPS, mobile hotspot)
- Auto-update mechanism
- Code signing certificates
---
## 3. Tech Stack
| Layer | Choice |
|---|---|
| Desktop framework | Electron 32+ |
| UI library | React 18 + TypeScript |
| Build tool | Vite 5 |
| Styling | Tailwind CSS 4 |
| State (UI) | Zustand |
| Validation | Zod |
| Privileged worker | Node.js (Windows Service via node-windows or equivalent) |
| Storage | Single JSON config file |
| Packaging | electron-builder |
| Testing | Vitest (unit), Playwright (e2e) |
Reuse the existing `electron-course` project as the starting point — Vite/TS/IPC/theme system are already configured.
---
## 4. Architecture
### High-level
```
┌──────────────────────────────────┐
│  Electron App (UI)               │
│  - Renderer: React UI            │
│  - Main: window mgmt, tray,      │
│    config file writer            │
└──────────────┬───────────────────┘
               │  writes config.json
               │  (atomic write)
               ▼
        ┌──────────────┐
        │ config.json  │  ← single source of truth
        │ (userData/)  │
        └──────┬───────┘
               │  watched by service
               ▼
┌──────────────────────────────────┐
│  Windows Service (Node.js)       │
│  - File watcher on config.json   │
│  - Schedule engine (60s tick)    │
│  - Hosts file writer             │
│  - DNS flush                     │
│  - Runs as SYSTEM/admin          │
└──────────────┬───────────────────┘
               │  writes
               ▼
       C:\Windows\System32\
       drivers\etc\hosts
```
### Key architectural decisions
- **Service does the blocking, app is just a config editor.** Blocking continues even if user never opens the UI, even if they kill the Electron process. App can be uninstalled and service alone could (in theory) keep running off existing config.
- **File-watching as IPC.** UI writes config.json atomically; service watches the file. No HTTP server, no named pipes, no auth. Simple.
- **One UAC prompt at install only.** Service is installed during setup with admin elevation; runs forever after. App itself runs unprivileged.
- **Marker-based hosts file management.** Only manage entries between `# === focus-blocker BEGIN ===` and `# === focus-blocker END ===`. Never touch entries outside markers.
---
## 5. Locked Decisions
| # | Decision | Choice |
|---|---|---|
| 1 | Pause button | None. Start = activate, Stop = deactivate |
| 2 | Window close | Minimize to tray, blocking continues |
| 3 | Quit friction | Confirmation dialog |
| 4 | Default config | Pre-populated with example group + schedule block |
| 5 | Existing hosts entries | Ignore, only manage marked region |
| 6 | License | MIT |
| 7 | Auto-launch on boot | Asked during first-run welcome |
| 8 | Background runtime | Electron tray app keeps running (UI side); service keeps running independently (engine side) |
| 9 | Admin elevation | Windows Service installed once at setup |
| 10 | Config location | `app.getPath('userData')` |
| 11 | Schedule overlap | Allowed, union of site groups |
| 12 | Domain variants | Auto-expand: bare, `www.`, `m.` |
| 13 | Subdomain handling | Block exactly what user typed, no wildcard magic |
| 14 | Scheduler tick | 60 seconds |
| 15 | Telemetry | None ever |
| 16 | Updates | Manual via GitHub releases |
| 17 | Error reporting | Tray notification + log file |
| 18 | Logging | File logs (userData) + hidden Debug tab in settings |
| 19 | Storage | Single `config.json` |
| 20 | Atomic writes | Write to `.tmp`, then rename |
| 21 | Schema versioning | `"version": 1` field, migration logic when v2 ships |
| 22 | UI ↔ service comm | File-watching on `config.json` |
| 23 | Service vs app split | Service = scheduler + hosts writer; App = UI only |
| 24 | Cross-platform | Windows-only for v1, Mac/Linux in v1.1 |
| 25 | Uninstaller | Removes app + service + cleans hosts file markers |
---
## 6. Data Model
### `config.json` schema
```typescript
interface Config {
  version: 1;
  active: boolean;                  // master on/off
  siteGroups: SiteGroup[];
  scheduleBlocks: ScheduleBlock[];
  preferences: Preferences;
}
interface SiteGroup {
  id: string;                       // uuid
  name: string;                     // "Social", "Anime", "Work distractions"
  sites: string[];                  // ["youtube.com", "instagram.com"]
}
interface ScheduleBlock {
  id: string;                       // uuid
  startMinute: number;              // 0-1439, minutes since midnight
  endMinute: number;                // 0-1439, can be < start (wraps midnight)
  siteGroupIds: string[];           // which groups to block during this block
}
interface Preferences {
  autoLaunchOnBoot: boolean;
  theme: 'light' | 'dark' | 'system';
  showWelcomeScreen: boolean;       // false after first-run completion
}
```
### Default config (first install)
```json
{
  "version": 1,
  "active": false,
  "siteGroups": [
    {
      "id": "<uuid>",
      "name": "Social",
      "sites": ["youtube.com", "instagram.com", "x.com"]
    }
  ],
  "scheduleBlocks": [
    {
      "id": "<uuid>",
      "startMinute": 1320,
      "endMinute": 480,
      "siteGroupIds": ["<social-uuid>"]
    }
  ],
  "preferences": {
    "autoLaunchOnBoot": false,
    "theme": "system",
    "showWelcomeScreen": true
  }
}
```
### Hosts file format (marked region)
```
# === focus-blocker BEGIN === DO NOT EDIT
# Managed by Focus Blocker. Last updated: 2026-05-08T22:30:00Z
# Currently blocking: Social
127.0.0.1 youtube.com
127.0.0.1 [www.youtube.com](https://www.youtube.com)
127.0.0.1 m.youtube.com
127.0.0.1 instagram.com
127.0.0.1 [www.instagram.com](https://www.instagram.com)
127.0.0.1 m.instagram.com
# === focus-blocker END ===
```
---
## 7. File Structure
```
focus-blocker/
├── src/
│   ├── electron/                  # Main process (UI app)
│   │   ├── main.ts                # Entry, window mgmt
│   │   ├── preload.cts            # IPC bridge
│   │   ├── tray.ts                # System tray
│   │   ├── ipc.ts                 # IPC handlers
│   │   ├── configStore.ts         # Atomic JSON read/write + Zod validation
│   │   ├── logger.ts              # File-based logging
│   │   └── tsconfig.json
│   │
│   ├── service/                   # Windows Service (privileged worker)
│   │   ├── index.ts               # Service entry
│   │   ├── scheduler.ts           # 60s tick, decides block state
│   │   ├── configWatcher.ts       # Watches config.json for changes
│   │   ├── hostsWriter/
│   │   │   ├── index.ts           # Platform dispatcher
│   │   │   ├── windows.ts         # C:\Windows\System32\drivers\etc\hosts
│   │   │   ├── markers.ts         # BEGIN/END region mgmt
│   │   │   └── variants.ts        # Domain variant expansion
│   │   ├── dnsFlush.ts            # ipconfig /flushdns
│   │   └── logger.ts              # Shared with electron via IPC log file
│   │
│   ├── shared/                    # Shared types, schema, constants
│   │   ├── types.ts               # Config, SiteGroup, ScheduleBlock interfaces
│   │   ├── schema.ts              # Zod schemas
│   │   ├── constants.ts           # MARKERS, REDIRECT_IP, paths
│   │   └── scheduleEngine.ts      # Pure function: (config, now) => sitesToBlock
│   │
│   └── ui/                        # React app
│       ├── main.tsx               # React entry
│       ├── App.tsx                # Router
│       ├── pages/
│       │   ├── Welcome.tsx        # First-run only
│       │   ├── Dashboard.tsx      # Status + activate toggle
│       │   ├── SiteGroups.tsx     # CRUD on groups
│       │   ├── Schedule.tsx       # Daily timeline editor
│       │   └── Settings.tsx       # Theme, auto-launch, debug, restore
│       ├── components/
│       │   ├── Timeline.tsx       # The 24h horizontal timeline
│       │   ├── SiteGroupCard.tsx
│       │   ├── ConfirmDialog.tsx
│       │   └── ThemeToggle.tsx    # From existing project
│       ├── hooks/
│       │   ├── useConfig.ts
│       │   └── useStatus.ts
│       ├── store/
│       │   └── themeStore.ts      # From existing project
│       └── styles/
│           └── index.css
│
├── e2e/                           # Playwright tests
├── tests/                         # Vitest unit tests
├── electron-builder.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── PLAN.md                        # This file
├── README.md
└── LICENSE                        # MIT
```
---
## 8. IPC Contract
### Renderer → Main Process
```typescript
window.blocker.getConfig(): Promise<Config>
window.blocker.saveConfig(config: Config): Promise<{ ok: boolean; error?: string }>
window.blocker.getStatus(): Promise<Status>
window.blocker.activate(): Promise<{ ok: boolean }>
window.blocker.deactivate(): Promise<{ ok: boolean }>
window.blocker.restoreHostsFile(): Promise<{ ok: boolean }>   // emergency reset
window.blocker.openLogFolder(): Promise<void>
window.blocker.getLogs(limit: number): Promise<LogEntry[]>
window.blocker.setAutoLaunch(enabled: boolean): Promise<void>
```
### Main → Renderer (events)
```typescript
'status-changed' → Status
'config-changed' → Config        // when service modifies state externally
'service-error' → { message: string; timestamp: number }
```
### Status type
```typescript
interface Status {
  active: boolean;
  serviceRunning: boolean;
  currentlyBlocking: { groupId: string; groupName: string }[];
  nextChange: { atMinute: number; willBlock: string[] } | null;
  lastError: string | null;
}
```
---
## 9. UI Screens
### Welcome (first run only)
- Explains what the app does in plain English
- Lists exactly what it modifies (hosts file, installs a service)
- Asks: "Enable auto-launch on system startup?" Yes / No
- "Got it, let's start" button
### Dashboard
- Big status card: "Active — currently blocking Social" or "Inactive"
- Next change indicator: "Free time starts in 47 min"
- Single big button: Activate / Deactivate (with confirmation on deactivate)
- Quick links: Edit Schedule, Manage Site Groups, Settings
### Site Groups
- List of group cards
- Each card: editable name, site count, list of sites with delete buttons, "Add site" input
- "+ New Group" button
- "Add from preset" button → modal with checkboxes (Social, Video, News, Shopping, etc.)
### Schedule
- Horizontal 24h timeline (00:00 → 24:00)
- Existing blocks shown as colored bars, color = group(s)
- Click empty area → "Add block" modal (start, end, groups to block)
- Click existing block → edit/delete
### Settings
- Theme toggle (light / dark / system)
- Auto-launch on boot toggle
- "Restore hosts file" emergency button (with confirmation)
- "Open log folder" button
- Debug tab (hidden, accessible via setting): live status, recent logs, service status
---
## 10. Build Plan — 4-Week Milestones
### Week 1: Engine Foundation (NO UI YET)
- [ ] Fork `electron-course`, rename, strip system monitor logic
- [ ] Set up new file structure
- [ ] Implement `shared/types.ts` and `shared/schema.ts` (Zod)
- [ ] Implement `shared/scheduleEngine.ts` — pure function, fully unit-tested
- [ ] Implement `service/hostsWriter/` for Windows with markers + variants
- [ ] Implement `service/dnsFlush.ts` for Windows
- [ ] Implement `service/configWatcher.ts` (file watching)
- [ ] Implement `service/scheduler.ts` (60s tick loop)
- [ ] Implement `electron/configStore.ts` (atomic writes)
- [ ] **Test gate:** Hand-write `config.json`, run service standalone, watch hosts file change at scheduled times. Must work for 24h before moving on.
### Week 2: Service Installation + IPC
- [ ] Wrap service as Windows Service (node-windows / nssm / native)
- [ ] Service install/uninstall scripts
- [ ] Test full install → service running → hosts file managed automatically
- [ ] Implement `electron/ipc.ts` handlers
- [ ] Implement `electron/tray.ts` with quit confirmation
- [ ] Implement auto-launch via `app.setLoginItemSettings`
- [ ] Implement `electron/logger.ts` and shared log format with service
- [ ] **Test gate:** Service runs blocking. Electron app reads/writes config and updates apply within 60s.
### Week 3: UI
- [ ] Set up routing (Welcome → Dashboard / Settings)
- [ ] Build `Dashboard` (read-only display + activate toggle)
- [ ] Build `SiteGroups` (CRUD, preset modal)
- [ ] Build `Schedule` (timeline component is the hardest piece — start there)
- [ ] Build `Settings` (theme, auto-launch, restore, log folder, debug)
- [ ] Build `Welcome` (first-run flow)
- [ ] Wire all IPC, error states, loading states
- [ ] Light/dark theme polish
### Week 4: Trust, Polish, Ship
- [ ] First-run welcome flow end-to-end
- [ ] "Restore hosts file" tested on dirty hosts file scenarios
- [ ] Error handling: hosts file read-only, DNS flush fails, service crashed, service not installed
- [ ] Log file viewer in Debug tab
- [ ] Uninstaller: removes service + cleans hosts markers
- [ ] electron-builder config: produces unsigned `.exe` installer
- [ ] Manual QA pass: install fresh on clean Windows VM, configure, verify blocking, uninstall, verify clean
- [ ] Write README with the *story* (DNS cache discovery, scheduler architecture, state-vs-process)
- [ ] Screenshots / GIF
- [ ] Push to GitHub, public release
---
## 11. Vibe-Coding Order (within each week)
The order that prevents painting yourself into corners:
1. **Types + schema** (`shared/types.ts`, `shared/schema.ts`)
2. **Pure schedule engine** (`shared/scheduleEngine.ts`) — easy to unit test
3. **Hosts writer with markers** — write tests, this is the dangerous module
4. **DNS flush + scheduler tick loop**
5. **Config store + file watching**
6. **Service wrapper + install scripts**
7. **Electron main process IPC**
8. **Tray + auto-launch**
9. **Site Groups screen** (easiest UI, builds confidence)
10. **Schedule screen** (hardest UI)
11. **Dashboard** (mostly displays state)
12. **Welcome + Settings**
13. **Error states + uninstaller**
**CRITICAL RULE:** Do not start UI work until the engine works end-to-end via hand-edited `config.json`. The #1 trap with vibe coding is building beautiful UI on top of a broken engine.
---
## 12. Testing Strategy
### Unit tests (Vitest)
- `scheduleEngine.ts` — full coverage. All edge cases:
  - Wrapping midnight
  - Overlapping blocks (union behavior)
  - Empty schedule
  - Single block covering 24h
  - Block exactly at minute boundary
- `markers.ts` — preserves entries outside markers, idempotent writes
- `variants.ts` — domain expansion, malformed input
### Integration tests
- Hand-written config → service runs → hosts file matches expected output
- Config changes mid-tick → next tick reflects new state
### E2E tests (Playwright, post-v1 if time)
- First-run welcome flow
- Create group, add to schedule, activate
### Manual QA checklist (Week 4)
- [ ] Fresh install on clean Windows 11 VM
- [ ] Welcome flow completes
- [ ] Default config blocks expected sites at expected times
- [ ] Adding/editing groups persists across app restart
- [ ] Killing Electron process: blocking continues
- [ ] Restarting machine: service auto-starts, blocking resumes
- [ ] Uninstall: service removed, hosts file clean, no leftover files
- [ ] Hosts file with pre-existing entries: untouched, our markers added cleanly
---
## 13. Trust & Safety Checklist (non-negotiable)
- [ ] README opens with "What this app modifies on your system" section
- [ ] Source code stays under ~2000 lines so reviewable in one sitting
- [ ] Zero network calls outside DNS flush
- [ ] Zero telemetry
- [ ] "Restore hosts file" button works even if app is broken
- [ ] Uninstaller verified to leave system clean
- [ ] All hosts file modifications stay inside markers
- [ ] LICENSE file present (MIT)
- [ ] No obfuscated/minified code in repo (only in built artifacts)
---
## 14. Risks & Open Questions
### Known risks
| Risk | Mitigation |
|---|---|
| Windows Service install needs admin, can fail | Clear error in installer, "Run as administrator" guidance |
| User has DNS-over-HTTPS in browser → blocking ineffective | README documents this, suggests disabling DoH in target browsers |
| Antivirus flags unsigned installer | Document in README, plan code signing for v1.1 |
| File-watching misses rapid config writes | Debounce writes, service re-reads on schedule tick anyway |
| User edits hosts file manually while service active | Service rewrites on next tick; markers protect external entries |
### Open questions to resolve during build
- Which Windows Service wrapper? (`node-windows`, `nssm`, custom) — research Week 2 day 1
- Naming: still "Focus Blocker"? Or rename before public release?
- Preset site lists: which presets ship by default? (Social, Video, News, Shopping, Adult — need final list)
---
## 15. Post-v1 Roadmap (NOT for v1)
- v1.1: macOS + Linux support (launchd, systemd)
- v1.2: Code signing + auto-update via electron-updater
- v2.0: App-level blocking (process killing)
- v2.1: Local usage analytics (time blocked, attempts during block windows)
- v2.2: Hardened mode (password lock, daily override limit)
- v3.0: Companion mobile app (separate product, different architecture)
---
## 16. Definition of Done for v1
- [ ] Public GitHub repo, MIT licensed
- [ ] README with story, screenshots, install instructions
- [ ] Working `.exe` installer in GitHub releases
- [ ] Tested install → use → uninstall cycle on clean Windows 11
- [ ] At least one piece of public content written (LinkedIn post or blog) linking to repo
- [ ] You personally use it for 7+ consecutive days without manual hosts file edits
