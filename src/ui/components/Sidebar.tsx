import { LayoutDashboard, Layers, CalendarClock, Settings as SettingsIcon, Shield, type LucideIcon } from 'lucide-react';

export type Route = 'dashboard' | 'groups' | 'schedule' | 'settings';

interface SidebarProps {
  route: Route;
  onNavigate: (r: Route) => void;
  active: boolean;
  open: boolean;
  onClose: () => void;
}

const ITEMS: { id: Route; label: string; Icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'groups', label: 'Site groups', Icon: Layers },
  { id: 'schedule', label: 'Schedule', Icon: CalendarClock },
  { id: 'settings', label: 'Settings', Icon: SettingsIcon },
];

export function Sidebar({ route, onNavigate, active, open }: SidebarProps) {
  return (
    <aside
      aria-hidden={!open}
      className="shrink-0 sticky top-11 overflow-hidden flex flex-col transition-[width] duration-200 ease-out"
      style={{
        width: open ? '240px' : '0px',
        height: 'calc(100vh - 2.75rem)',
        background: 'var(--bg-secondary)',
        borderRight: open ? '1px solid var(--border)' : '1px solid transparent',
      }}
    >
      <div style={{ minWidth: '240px' }} className="flex flex-col h-full">
        <div className="px-4 pt-4 pb-3 flex items-center gap-2.5 select-none">
          <div
            className="h-7 w-7 rounded-md inline-flex items-center justify-center"
            style={{ background: 'var(--text)', color: 'var(--bg)' }}
          >
            <Shield size={15} strokeWidth={2.25} />
          </div>
          <div className="leading-tight">
            <div className="text-[13.5px] font-semibold text-default">Focus Blocker</div>
            <div className="text-[11.5px] text-muted mt-0.5 inline-flex items-center gap-1.5">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: active ? 'var(--success)' : 'var(--text-faint)' }}
              />
              {active ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>

        <nav className="px-2 mt-1 flex flex-col gap-0.5">
          {ITEMS.map(({ id, label, Icon }) => {
            const isActive = route === id;
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className="inline-flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13.5px] transition-colors"
                style={{
                  color: isActive ? 'var(--text)' : 'var(--text-muted)',
                  fontWeight: isActive ? 500 : 400,
                  background: isActive ? 'var(--bg-active)' : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <Icon size={15} strokeWidth={1.75} className="shrink-0" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="mt-auto px-3 pb-3 text-[11px] text-faint">v0.1.0</div>
      </div>
    </aside>
  );
}
