import { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Award, Flame, Trophy } from 'lucide-react';
import type { Milestone } from '../hooks/useMilestone';

/**
 * Renders the milestone moment for 7 / 30 / 100-day streaks.
 *  - 7  → toast in the top-right + a single confetti burst
 *  - 30 → larger toast + a longer multi-burst
 *  - 100 → full-screen overlay + sustained confetti, dismissable
 *
 * Confetti uses `canvas-confetti` which appends its own canvas to the
 * document body and cleans up automatically. Safe to fire multiple bursts.
 */

interface Props {
  milestone: Milestone | null;
  onDismiss: () => void;
}

export function MilestoneCelebration({ milestone, onDismiss }: Props) {
  useEffect(() => {
    if (milestone === null) return;
    const cleanup = fireConfetti(milestone);
    if (milestone !== 100) {
      // Auto-dismiss the toast after 6s. The 100-day full-screen waits
      // for the user to explicitly acknowledge.
      const t = setTimeout(onDismiss, 6_000);
      return () => {
        clearTimeout(t);
        cleanup?.();
      };
    }
    return () => cleanup?.();
  }, [milestone, onDismiss]);

  if (milestone === null) return null;
  if (milestone === 100) return <FullScreenCelebration onDismiss={onDismiss} />;
  return <Toast milestone={milestone} onDismiss={onDismiss} />;
}

function Toast(props: { milestone: Milestone; onDismiss: () => void }) {
  const is30 = props.milestone === 30;
  return (
    <div
      className="fixed z-50 right-5 bottom-5 max-w-sm cursor-pointer"
      onClick={props.onDismiss}
    >
      <div
        className="card flex items-start gap-3 p-4"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div
          className="h-10 w-10 grid place-items-center rounded-lg shrink-0"
          style={{
            background: is30 ? 'var(--accent-soft)' : 'var(--warning-soft)',
            color: is30 ? 'var(--accent)' : 'var(--warning)',
          }}
        >
          {is30 ? <Award size={20} /> : <Flame size={20} />}
        </div>
        <div className="flex-1">
          <div className="text-[14.5px] font-semibold">
            {is30 ? '30-day streak — badge unlocked' : '7-day streak'}
          </div>
          <div className="text-[12.5px] text-muted mt-1 leading-relaxed">
            {is30
              ? 'A whole month of staying with your schedule. The hard part is consistency, and you have it.'
              : 'A full week of focus. The flame is officially yours.'}
          </div>
          <div className="text-[11px] text-faint mt-2">Click anywhere to dismiss.</div>
        </div>
      </div>
    </div>
  );
}

function FullScreenCelebration(props: { onDismiss: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center"
      style={{ background: 'rgba(0, 0, 0, 0.7)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="card max-w-md text-center px-8 py-10"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div
          className="h-16 w-16 grid place-items-center rounded-full mx-auto"
          style={{
            background: 'var(--warning-soft)',
            color: 'var(--warning)',
          }}
        >
          <Trophy size={28} />
        </div>
        <h1 className="text-[28px] font-semibold tracking-tight mt-4">100 days.</h1>
        <p className="text-[14px] text-muted mt-3 leading-relaxed">
          Three figures. A hundred consecutive days of holding your schedule. Most habits don't
          make it past a week — you've cleared the threshold where this stops being effort and
          starts being who you are.
        </p>
        <button onClick={props.onDismiss} className="btn btn-primary mt-6 px-5 h-10">
          Keep going
        </button>
      </div>
    </div>
  );
}

function fireConfetti(milestone: Milestone): (() => void) | undefined {
  if (milestone === 7) {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { x: 0.95, y: 0.92 },
      ticks: 200,
    });
    return;
  }
  if (milestone === 30) {
    confetti({ particleCount: 120, spread: 80, origin: { x: 0.5, y: 0.4 }, ticks: 250 });
    setTimeout(
      () => confetti({ particleCount: 80, spread: 90, origin: { x: 0.2, y: 0.5 } }),
      300,
    );
    setTimeout(
      () => confetti({ particleCount: 80, spread: 90, origin: { x: 0.8, y: 0.5 } }),
      600,
    );
    return;
  }
  // 100-day: a few bursts, then a slow drizzle for a couple of seconds.
  let cancelled = false;
  confetti({ particleCount: 200, spread: 130, origin: { x: 0.5, y: 0.4 }, ticks: 300 });
  const drizzle = (i: number) => {
    if (cancelled || i > 6) return;
    confetti({
      particleCount: 60,
      spread: 110,
      origin: { x: Math.random(), y: Math.random() * 0.5 },
      ticks: 250,
      startVelocity: 30,
    });
    setTimeout(() => drizzle(i + 1), 350);
  };
  setTimeout(() => drizzle(0), 250);
  return () => {
    cancelled = true;
    confetti.reset();
  };
}
