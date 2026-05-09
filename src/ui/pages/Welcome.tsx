import { useState } from 'react';
import { ArrowRight, BriefcaseBusiness, Cog, FileEdit, GraduationCap, Lock, Moon, Plus, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useConfig } from '../hooks/useConfig';
import { buildFromPreset, PRESETS, type Preset } from '../presets/schedules';

const PRESET_ICONS: Record<Preset['id'], LucideIcon> = {
  student: GraduationCap,
  office: BriefcaseBusiness,
  'night-shift': Moon,
  blank: Plus,
};

export function WelcomePage(props: { onDone: () => void }) {
  const { config, update } = useConfig();
  const [autoLaunch, setAutoLaunch] = useState(false);
  const [presetId, setPresetId] = useState<Preset['id']>('student');
  const [busy, setBusy] = useState(false);

  if (!config) return null;

  const finish = async () => {
    setBusy(true);
    try {
      const chosen = PRESETS.find((p) => p.id === presetId)!;
      await window.blocker.setAutoLaunch(autoLaunch);
      await update((draft) => {
        draft.preferences.showWelcomeScreen = false;
        draft.preferences.autoLaunchOnBoot = autoLaunch;

        // Apply the preset only if it has any content. "Start blank" leaves
        // whatever's already in the default config (from the install path).
        if (presetId !== 'blank' && (chosen.siteGroups.length > 0 || chosen.scheduleBlocks.length > 0)) {
          const built = buildFromPreset(chosen);
          draft.siteGroups = built.siteGroups;
          draft.scheduleBlocks = built.scheduleBlocks;
        }
      });
      props.onDone();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-2.5rem)] grid place-items-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div
          className="h-12 w-12 rounded-xl grid place-items-center mb-6"
          style={{ background: 'var(--text)', color: 'var(--bg)' }}
        >
          <Shield size={22} strokeWidth={2.25} />
        </div>
        <h1 className="text-[34px] font-semibold tracking-tight leading-tight">
          Welcome to Focus Blocker
        </h1>
        <p className="text-[15px] text-muted mt-3 leading-relaxed">
          Define site groups and a daily schedule. When a window starts, the listed sites
          stop loading until the window ends. Nothing leaves your computer.
        </p>

        <div className="mt-8 grid gap-2">
          <Bullet
            Icon={FileEdit}
            title="Edits a managed region of your hosts file"
            body={
              <>
                Sites are redirected to <code className="kbd">127.0.0.1</code>. Entries outside our
                <code className="kbd">BEGIN</code>/<code className="kbd">END</code> markers are never touched.
              </>
            }
          />
          <Bullet
            Icon={Cog}
            title="Runs in the background"
            body="A small main process (or optional Windows Service) keeps the schedule running even when this window is closed."
          />
          <Bullet
            Icon={Lock}
            title="Stays on your machine"
            body="No accounts, no telemetry, no network calls beyond the local DNS flush."
          />
        </div>

        {/* Presets */}
        <div className="mt-9">
          <h2 className="text-[15px] font-semibold">Pick a starting point</h2>
          <p className="text-[12.5px] text-muted mt-0.5">
            You can edit anything later — these are just templates to skip the blank-page step.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {PRESETS.map((p) => {
              const Icon = PRESET_ICONS[p.id];
              const selected = presetId === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setPresetId(p.id)}
                  className="text-left p-4 rounded-md transition-[background,border-color]"
                  style={{
                    background: selected ? 'var(--bg-active)' : 'var(--bg-secondary)',
                    border: '1px solid ' + (selected ? 'var(--border-strong)' : 'var(--border)'),
                  }}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className="h-7 w-7 grid place-items-center rounded-md shrink-0"
                      style={{
                        background: selected ? 'var(--text)' : 'var(--bg)',
                        color: selected ? 'var(--bg)' : 'var(--text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <Icon size={14} />
                    </span>
                    <div className="text-[13.5px] font-medium">{p.name}</div>
                  </div>
                  <div className="text-[12px] text-muted mt-2 leading-relaxed">{p.description}</div>
                  {p.id !== 'blank' && (
                    <div className="text-[11px] text-faint mt-2 tabular-nums">
                      {p.siteGroups.length} group{p.siteGroups.length === 1 ? '' : 's'} · {p.scheduleBlocks.length} block
                      {p.scheduleBlocks.length === 1 ? '' : 's'}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <label
          className="mt-8 flex items-center justify-between gap-3 px-4 py-3 rounded-md cursor-pointer transition-colors"
          style={{ border: '1px solid var(--border)' }}
        >
          <div>
            <div className="text-[13.5px] font-medium">Open Focus Blocker at sign-in</div>
            <div className="text-[12.5px] text-muted mt-0.5">You can change this any time in Settings.</div>
          </div>
          <input
            type="checkbox"
            checked={autoLaunch}
            onChange={(e) => setAutoLaunch(e.target.checked)}
            className="h-4 w-4"
          />
        </label>

        <div className="mt-8 flex justify-end">
          <button onClick={finish} disabled={busy} className="btn btn-primary h-10 px-5">
            {busy ? 'Working…' : "Got it, let's start"} <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

function Bullet(props: { Icon: LucideIcon; title: string; body: React.ReactNode }) {
  const { Icon } = props;
  return (
    <div className="flex items-start gap-3 px-3 py-2.5 rounded-md" style={{ background: 'var(--bg-secondary)' }}>
      <div
        className="h-7 w-7 grid place-items-center rounded-md shrink-0 mt-0.5"
        style={{ background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text)' }}
      >
        <Icon size={14} />
      </div>
      <div>
        <div className="text-[13.5px] font-medium">{props.title}</div>
        <div className="text-[12.5px] text-muted mt-0.5 leading-relaxed">{props.body}</div>
      </div>
    </div>
  );
}
