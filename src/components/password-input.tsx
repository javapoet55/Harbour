'use client';

import { useState, type ComponentProps } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function PasswordInput(props: Omit<ComponentProps<'input'>, 'type' | 'className'>) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <span className="relative mt-1 block">
      {/* .harbor-input sets padding outside Tailwind's layers, so a utility class would not win. */}
      <input {...props} type={visible ? 'text' : 'password'} className="harbor-input" style={{ paddingRight: '2.75rem' }} />
      <button type="button" className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[var(--muted)] hover:text-[var(--ink)]" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((shown) => !shown)}>
        <Icon size={18} aria-hidden="true" />
      </button>
    </span>
  );
}
