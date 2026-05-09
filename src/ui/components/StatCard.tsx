import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  Icon?: LucideIcon;
  /** Optional accent for the icon tile (e.g. 'var(--success)'). */
  accent?: string;
  onClick?: () => void;
}

/** Reused on Dashboard's stat strip and the Stats page hero block. */
export function StatCard({ label, value, subtitle, Icon, accent, onClick }: StatCardProps) {
  const interactive = !!onClick;
  const Tag: any = interactive ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      className={'card text-left p-5 transition-colors ' + (interactive ? '' : '')}
      onMouseEnter={
        interactive
          ? (e: any) => ((e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)')
          : undefined
      }
      onMouseLeave={
        interactive
          ? (e: any) => ((e.currentTarget as HTMLElement).style.background = '')
          : undefined
      }
    >
      <div className="flex items-center gap-2 text-muted">
        {Icon && (
          <span
            className="h-5 w-5 inline-flex items-center justify-center rounded-md"
            style={accent ? { color: accent } : undefined}
          >
            <Icon size={14} />
          </span>
        )}
        <span className="text-[12px] uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-[26px] font-semibold mt-1.5 leading-none tabular-nums">{value}</div>
      {subtitle && <div className="text-[12.5px] text-muted mt-1.5">{subtitle}</div>}
    </Tag>
  );
}
