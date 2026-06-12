import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from '@phosphor-icons/react';
import IconButton from './IconButton';

export interface ModalProps {
  /** Modal title (uppercase display type). Omit for a chromeless body. */
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  /** Footer slot — typically Buttons, right-aligned. */
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Set false for must-answer dialogs (onboarding). Default true. */
  dismissable?: boolean;
}

/** Centered dialog. Esc + backdrop close (unless dismissable={false}). */
export default function Modal({
  title,
  onClose,
  children,
  footer,
  size = 'md',
  dismissable = true,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    window.addEventListener('keydown', onKey);
    cardRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, dismissable]);

  return createPortal(
    <div
      className="ui-modal-backdrop"
      onMouseDown={(e) => {
        if (dismissable && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={cardRef}
        className={`ui-modal ui-modal--${size}`}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
      >
        {(title || dismissable) && (
          <div className="ui-modal__header">
            {title && <h2 className="ui-modal__title">{title}</h2>}
            {dismissable && (
              <IconButton icon={<X weight="bold" />} label="Close" size="sm" onClick={onClose} />
            )}
          </div>
        )}
        <div className="ui-modal__body">{children}</div>
        {footer && <div className="ui-modal__footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
