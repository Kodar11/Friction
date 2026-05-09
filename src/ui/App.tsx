import { useEffect, useState } from 'react';
import { useThemeStore } from './store/themeStore';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import { Sidebar, type Route } from './components/Sidebar';
import { Header } from './components/Header';
import { useConfig } from './hooks/useConfig';
import { useStats } from './hooks/useStats';
import { useMilestone } from './hooks/useMilestone';
import { MilestoneCelebration } from './components/MilestoneCelebration';
import { WelcomePage } from './pages/Welcome';
import { DashboardPage } from './pages/Dashboard';
import { SiteGroupsPage } from './pages/SiteGroups';
import { SchedulePage } from './pages/Schedule';
import { StatsPage } from './pages/Stats';
import { SettingsPage } from './pages/Settings';

function App() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  useResolvedTheme(theme);

  const [route, setRoute] = useState<Route>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { config } = useConfig();
  const { stats } = useStats();
  const { pending: pendingMilestone, acknowledge: acknowledgeMilestone } = useMilestone(
    stats?.streak.current,
  );

  useEffect(() => {
    if (config?.preferences.theme && config.preferences.theme !== theme) {
      setTheme(config.preferences.theme);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.preferences.theme]);

  const showWelcome = config?.preferences.showWelcomeScreen === true;

  return (
    <div className="min-h-screen surface text-default">
      <Header
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        showSidebarToggle={!showWelcome}
      />
      {showWelcome ? (
        <WelcomePage onDone={() => setRoute('dashboard')} />
      ) : (
        <div className="flex">
          <Sidebar
            route={route}
            onNavigate={setRoute}
            active={!!config?.active}
            open={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />
          <main className="flex-1 min-w-0">
            <div className="max-w-3xl mx-auto px-8 pt-10 pb-16">
              {route === 'dashboard' && <DashboardPage onNavigate={setRoute} />}
              {route === 'groups' && <SiteGroupsPage />}
              {route === 'schedule' && <SchedulePage />}
              {route === 'stats' && <StatsPage />}
              {route === 'settings' && <SettingsPage />}
            </div>
          </main>
        </div>
      )}
      <MilestoneCelebration milestone={pendingMilestone} onDismiss={acknowledgeMilestone} />
    </div>
  );
}

export default App;
