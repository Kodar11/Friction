export function PageLoader({ text = 'Loading…' }: { text?: string }) {
  return (
    <div className="card card-section flex items-center justify-center py-10">
      <div className="text-[13px] text-muted">{text}</div>
    </div>
  );
}