import { useEffect } from 'react';
import { CheckCircle, Info, WarningCircle, XCircle, X } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import IconButton from './IconButton';

export type ToastVariant = 'info' | 'success' | 'warn' | 'error';

export interface ToastProps {
  message: string | null;
  onDismiss: () => void;
  variant?: ToastVariant;
  /** Auto-dismiss in ms; 0 disables. */
  duration?: number;
}

const ICONS = {
  info: Info,
  success: CheckCircle,
  warn: WarningCircle,
  error: XCircle,
} as const;

/** Bottom-center toast. Auto-dismisses; colored left edge per variant. */
export default function Toast({ message, onDismiss, variant = 'info', duration = 6000 }: ToastProps) {
  const { t } = useTranslation();
  useEffect(() => {
    if (!message || duration <= 0) return;
    const t = setTimeout(onDismiss, duration);
    return () => clearTimeout(t);
  }, [message, duration, onDismiss]);

  if (!message) return null;
  const Icon = ICONS[variant];
  return (
    <div className={`ui-toast ui-toast--${variant}`} role="status">
      <span className="ui-toast__icon"><Icon weight="fill" /></span>
      <span className="ui-toast__msg">{message}</span>
      <IconButton icon={<X weight="bold" />} label={t('common.dismiss')} size="sm" onClick={onDismiss} />
    </div>
  );
}
