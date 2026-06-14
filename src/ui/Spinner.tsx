import { useTranslation } from 'react-i18next';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

export default function Spinner({ size = 'md' }: SpinnerProps) {
  const { t } = useTranslation();
  return <span className={`ui-spinner ui-spinner--${size}`} role="status" aria-label={t('common.loadingAria')} />;
}
