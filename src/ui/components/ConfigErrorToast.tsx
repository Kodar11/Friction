import { useEffect, useState } from 'react';
import { useConfig } from '../hooks/useConfig';

export function ConfigErrorToast() {
  const { error } = useConfig();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (error) {
      setVisible(true);
      const t = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(t);
    }
  }, [error]);

  if (!visible || !error) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg shadow-lg text-[13px] font-medium"
      style={{ background: 'var(--danger)', color: '#fff' }}
    >
      Save failed: {error}
    </div>
  );
}