import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  subtitle?: string;
  Icon?: LucideIcon;
  accent?: string;
  onClick?: () => void;
}

export function StatCard({ label, value, subtitle, Icon, accent, onClick }: StatCardProps) {
  const interactive = !!onClick;
  const Tag: any = interactive ? 'button' : 'div';
  return (
    <Tag
      onClick={onClick}
      aria-label={interactive ? `${label}: ${value}${subtitle ? `, ${subtitle}` : ''}` : undefined}
      className={
        'card text-left p-5 transition-colors' +
        (interactive ? ' cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--accent)]' : '')
      }
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