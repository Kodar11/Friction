import { useEffect, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog(props: Props) {
  const {
    open, title, message,
    confirmLabel = 'Confirm', cancelLabel = 'Cancel',
    destructive, onConfirm, onCancel,
  } = props;
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
    };
    window.addEventListener('keydown', onKey);
    cancelRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="card w-full max-w-md"
        style={{ boxShadow: 'var(--shadow-lg)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-section">
          <h2 id="confirm-title" className="text-[16px] font-semibold">{title}</h2>
          <p className="text-[13px] text-muted mt-1.5 whitespace-pre-line">{message}</p>
        </div>
        <div className="divider" />
        <div className="card-section py-3 flex justify-end gap-2">
          <button ref={cancelRef} onClick={onCancel} className="btn">{cancelLabel}</button>
          <button
            onClick={onConfirm}
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}