import { useEffect, useMemo, useRef, useState } from 'react';
import { ShieldAlert, X } from 'lucide-react';

type Flow = 'needs-confirm' | 'needs-phrase' | 'needs-countdown' | 'blocked';

interface Props {
  open: boolean;
  flow: Flow;
  countdownMs?: number;
  requiredPhrase?: string;
  onComplete: (reason: string | null) => void;
  onCancel: (reason: string | null) => void;
  onNavigate?: (route: string) => void;
}

export function DeactivateDialog(props: Props) {
  if (!props.open) return null;
  if (props.flow === 'blocked') return <BlockedDialog onClose={() => props.onCancel(null)} onNavigate={props.onNavigate} />;
  if (props.flow === 'needs-confirm') {
    return <ConfirmFlow onComplete={() => props.onComplete(null)} onCancel={() => props.onCancel(null)} />;
  }
  if (props.flow === 'needs-phrase') {
    return (
      <PhraseFlow
        phrase={props.requiredPhrase ?? 'DEACTIVATE FRICTION'}
        onComplete={() => props.onComplete(null)}
        onCancel={() => props.onCancel(null)}
      />
    );
  }
  return (
    <CountdownFlow
      durationMs={props.countdownMs ?? 5 * 60_000}
      onComplete={(reason) => props.onComplete(reason)}
      onCancel={(reason) => props.onCancel(reason)}
    />
  );
}

function Shell(props: { title: string; children: React.ReactNode; onCloseHint?: () => void }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="deactivate-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
    >
      <div className="card w-full max-w-md" style={{ boxShadow: 'var(--shadow-lg)' }}>
        <div className="card-section flex items-start gap-3">
          <div
            className="h-9 w-9 grid place-items-center rounded-lg shrink-0"
            style={{ background: 'var(--warning-soft)', color: 'var(--warning)' }}
          >
            <ShieldAlert size={18} />
          </div>
          <h2 id="deactivate-title" className="text-[16px] font-semibold flex-1">{props.title}</h2>
          {props.onCloseHint && (
            <button
              onClick={props.onCloseHint}
              aria-label="Close"
              className="text-muted hover:text-default"
            >
              <X size={16} />
            </button>
          )}
        </div>
        <div className="divider" />
        {props.children}
      </div>
    </div>
  );
}

function ConfirmFlow(props: { onComplete: () => void; onCancel: () => void }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); props.onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <Shell title="Turn off blocking?" onCloseHint={props.onCancel}>
      <div className="card-section">
        <p className="text-[13px] text-muted">
          Sites will become reachable immediately. You can turn blocking back on at any time.
        </p>
      </div>
      <div className="divider" />
      <div className="card-section py-3 flex justify-end gap-2">
        <button ref={cancelRef} onClick={props.onCancel} className="btn">Cancel</button>
        <button onClick={props.onComplete} className="btn btn-danger">Turn off</button>
      </div>
    </Shell>
  );
}

function PhraseFlow(props: { phrase: string; onComplete: () => void; onCancel: () => void }) {
  const [value, setValue] = useState('');
  const matches = value === props.phrase;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <Shell title="Type the phrase to turn off" onCloseHint={props.onCancel}>
      <div className="card-section">
        <p className="text-[13px] text-muted">
          To confirm, type the phrase below exactly. Case-sensitive.
        </p>
        <div
          className="mt-3 px-3 py-2 rounded-md font-mono text-[13.5px] tracking-wide select-all"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
          role="textbox"
          aria-label={`Required phrase: ${props.phrase}`}
          tabIndex={0}
        >
          {props.phrase}
        </div>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') props.onCancel();
            if (e.key === 'Enter' && matches) props.onComplete();
          }}
          className="field w-full mt-3 font-mono"
          placeholder="Type the phrase here…"
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      <div className="divider" />
      <div className="card-section py-3 flex justify-end gap-2">
        <button onClick={props.onCancel} className="btn">Cancel</button>
        <button onClick={props.onComplete} disabled={!matches} className="btn btn-danger">
          Turn off
        </button>
      </div>
    </Shell>
  );
}

function CountdownFlow(props: {
  durationMs: number;
  onComplete: (reason: string | null) => void;
  onCancel: (reason: string | null) => void;
}) {
  const [remaining, setRemaining] = useState(props.durationMs);
  const [reason, setReason] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const startedAt = Date.now();
    const t = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const left = Math.max(0, props.durationMs - elapsed);
      setRemaining(left);
      if (left <= 0) clearInterval(t);
    }, 250);
    cancelRef.current?.focus();
    return () => clearInterval(t);
  }, [props.durationMs]);

  const ready = remaining <= 0;
  const reasonReady = reason.trim().length > 0;

  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  const progress = useMemo(
    () => 1 - remaining / props.durationMs,
    [remaining, props.durationMs],
  );

  return (
    <Shell title="Hard Mode cooldown" onCloseHint={() => props.onCancel(reason || null)}>
      <div className="card-section">
        <p className="text-[13px] text-muted">
          You're about to turn off blocking. There's a cool-down window — leave this open
          and tell us why. You can cancel any time during the countdown.
        </p>

        <div className="mt-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[12px] text-muted uppercase tracking-wide">Cool-down</div>
            <div className="text-[28px] font-semibold tabular-nums leading-none" aria-live="polite" aria-atomic="true">
              {ready ? 'Ready' : display}
            </div>
          </div>
          <div
            className="mt-2 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'var(--bg-active)' }}
          >
            <div
              className="h-full transition-[width] duration-200 ease-linear"
              style={{
                width: `${Math.round(progress * 100)}%`,
                background: 'var(--warning)',
              }}
            />
          </div>
        </div>

        <label className="block mt-5">
          <div className="text-[11.5px] uppercase tracking-wide text-muted">Why are you turning off blocking?</div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Required — anything works. This stays on your machine."
            className="field w-full mt-1 resize-y"
          />
        </label>
      </div>
      <div className="divider" />
      <div className="card-section py-3 flex justify-end gap-2">
        <button ref={cancelRef} onClick={() => props.onCancel(reason || null)} className="btn">Cancel</button>
        <button
          onClick={() => props.onComplete(reason)}
          disabled={!ready || !reasonReady}
          className="btn btn-danger"
          title={!ready ? 'Wait for the cool-down to finish' : !reasonReady ? 'Reason required' : ''}
        >
          {ready ? 'Turn off' : `Wait ${display}`}
        </button>
      </div>
    </Shell>
  );
}

function BlockedDialog(props: { onClose: () => void; onNavigate?: (route: string) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);

  return (
    <Shell title="Blocking can't be turned off right now" onCloseHint={props.onClose}>
      <div className="card-section">
        <p className="text-[13px] text-muted">
          You set Hard Mode to <span className="kbd">Extreme</span>. While you're inside a scheduled
          block window, blocking can't be turned off. Wait until the window ends, or change the level
          in <strong className="text-default">Settings → Hard Mode</strong>.
        </p>
        {props.onNavigate && (
          <button
            onClick={() => props.onNavigate!('settings')}
            className="btn mt-3"
          >
            Go to Settings
          </button>
        )}
      </div>
      <div className="divider" />
      <div className="card-section py-3 flex justify-end gap-2">
        <button onClick={props.onClose} className="btn btn-primary">Got it</button>
      </div>
    </Shell>
  );
}