import type { SelectHTMLAttributes } from 'react';
import { CaretDown } from '@phosphor-icons/react';

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

/** Native select with FIELD GLASS chrome (custom chevron, brass focus). */
export default function Select({ className, children, ...rest }: SelectProps) {
  return (
    <span className="ui-select-wrap">
      <select className={['ui-select', className].filter(Boolean).join(' ')} {...rest}>
        {children}
      </select>
      <span className="ui-select-wrap__chevron">
        <CaretDown size={13} weight="bold" />
      </span>
    </span>
  );
}
