import React, { useEffect } from "react";

interface ToastProps {
  message: string | null;
  onDismiss: () => void;
}

export default function Toast({ message, onDismiss }: ToastProps): React.JSX.Element | null {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDismiss, 4000);
    return () => clearTimeout(id);
  }, [message, onDismiss]);

  if (!message) return null;

  return (
    <div className="toast" role="alert">
      <span className="toast-message">{message}</span>
      <button type="button" className="toast-close" onClick={onDismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
