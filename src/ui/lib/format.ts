export function fmt(m: number): string {
  const h = Math.floor(m / 60).toString().padStart(2, '0');
  const mm = (m % 60).toString().padStart(2, '0');
  return `${h}:${mm}`;
}

export function currentMinute(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function formatHoursValue(minutes: number): string {
  if (minutes < 60) return `${minutes}`;
  const hours = minutes / 60;
  if (hours < 10) return hours.toFixed(1);
  return `${Math.round(hours)}`;
}

export function dayChipSummary(days: number[]): string {
  const sorted = [...days].sort();
  const weekdays = JSON.stringify(sorted) === JSON.stringify([1, 2, 3, 4, 5]);
  const weekends = JSON.stringify(sorted) === JSON.stringify([0, 6]);
  if (weekdays) return 'Weekdays';
  if (weekends) return 'Weekends';
  const labels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return sorted.map((d) => labels[d]).join(', ');
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}