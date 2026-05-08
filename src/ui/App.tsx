import { useEffect, useMemo, useState } from 'react';
import { useStatistics } from './useStatistics';
import { Chart } from './Chart';
import { useThemeStore } from './store/themeStore';
import { ThemeToggle } from './components/ThemeToggle';

function App() {
  const staticData = useStaticData();
  const statistics = useStatistics(10);
  const [activeView, setActiveView] = useState<View>('CPU');
  const theme = useThemeStore((state) => state.theme);

  const cpuUsages = useMemo(
    () => statistics.map((stat) => stat.cpuUsage),
    [statistics]
  );
  const ramUsages = useMemo(
    () => statistics.map((stat) => stat.ramUsage),
    [statistics]
  );
  const storageUsages = useMemo(
    () => statistics.map((stat) => stat.storageUsage),
    [statistics]
  );
  const activeUsages = useMemo(() => {
    switch (activeView) {
      case 'CPU':
        return cpuUsages;
      case 'RAM':
        return ramUsages;
      case 'STORAGE':
        return storageUsages;
    }
  }, [activeView, cpuUsages, ramUsages, storageUsages]);

  useEffect(() => {
    return window.electron.subscribeChangeView((view) => setActiveView(view));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="min-h-screen theme-bg theme-text transition-colors duration-300">
      <Header />
      <main className="mx-auto mt-16 grid max-w-6xl grid-cols-[16rem_1fr] gap-4 px-4 pb-8">
        <div className="space-y-4">
          <SelectOption
            onClick={() => setActiveView('CPU')}
            title="CPU"
            view="CPU"
            subTitle={staticData?.cpuModel ?? ''}
            data={cpuUsages}
          />
          <SelectOption
            onClick={() => setActiveView('RAM')}
            title="RAM"
            view="RAM"
            subTitle={(staticData?.totalMemoryGB.toString() ?? '') + ' GB'}
            data={ramUsages}
          />
          <SelectOption
            onClick={() => setActiveView('STORAGE')}
            title="STORAGE"
            view="STORAGE"
            subTitle={(staticData?.totalStorage.toString() ?? '') + ' GB'}
            data={storageUsages}
          />
        </div>
        <section className="rounded-4xl theme-surface p-5 shadow-lg shadow-black/20">
          <div className="mb-5 flex items-center justify-between gap-4 text-sm theme-muted">
            <div className="text-2xl font-semibold theme-text">{activeView} Usage</div>
            <div className="rounded-full theme-button px-3 py-1 text-xs uppercase tracking-[0.2em] theme-muted">
              Live data
            </div>
          </div>
          <div className="h-80 rounded-3xl theme-surface-alt p-3">
            <Chart selectedView={activeView} data={activeUsages} maxDataPoints={10} />
          </div>
        </section>
      </main>
    </div>
  );
}

function SelectOption(props: {
  title: string;
  view: View;
  subTitle: string;
  data: number[];
  onClick: () => void;
}) {
  return (
    <button
      className="flex w-full flex-col justify-between rounded-3xl bg-slate-800 p-5 text-left transition hover:bg-slate-700"
      onClick={props.onClick}
    >
      <div className="flex items-center justify-between gap-3 text-sm text-slate-400">
        <span className="text-base font-semibold text-slate-100">{props.title}</span>
        <span className="text-xs text-slate-400">{props.subTitle}</span>
      </div>
      <div className="mt-4 h-20 w-full rounded-3xl bg-slate-950/50 p-2">
        <Chart selectedView={props.view} data={props.data} maxDataPoints={10} />
      </div>
    </button>
  );
}

function Header() {
  return (
    <header className="app-header flex items-center justify-between theme-header px-4 py-3 shadow-lg shadow-black/20 backdrop-blur-xl theme-text">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-red-500" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
        </div>
        <span className="text-sm font-semibold uppercase tracking-[0.24em] theme-text select-none">
          System Monitor
        </span>
      </div>

      <div className="app-header-buttons flex items-center gap-2">
        <ThemeToggle />
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-(--button) ring-1 ring-white/10 transition hover:bg-red-500/90"
          onClick={() => window.electron.sendFrameAction('CLOSE')}
          aria-label="Close"
        />
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-(--button) ring-1 ring-white/10 transition hover:bg-yellow-400/90"
          onClick={() => window.electron.sendFrameAction('MINIMIZE')}
          aria-label="Minimize"
        />
        <button
          className="flex h-9 w-9 items-center justify-center rounded-full bg-(--button) ring-1 ring-white/10 transition hover:bg-emerald-400/90"
          onClick={() => window.electron.sendFrameAction('MAXIMIZE')}
          aria-label="Maximize"
        />
      </div>
    </header>
  );
}

function useStaticData() {
  const [staticData, setStaticData] = useState<StaticData | null>(null);

  useEffect(() => {
    (async () => {
      setStaticData(await window.electron.getStaticData());
    })();
  }, []);

  return staticData;
}

export default App;
