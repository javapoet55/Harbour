'use client';

import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight, Eye, EyeOff, Lock, type LucideIcon } from 'lucide-react';
import { NexdoLogo } from '@/components/nexdo-logo';
import './auth.css';

/**
 * The frame every account page shares: brand panel with its illustration on the left, the form on the
 * right. `scene` picks the illustration. On narrow screens the brand panel collapses to a header.
 */
export function AuthShell({ scene, aside, children }: { scene: 'signup' | 'login' | 'reset'; aside: ReactNode; children: ReactNode }) {
  return (
    <main className={`au au-${scene}`}>
      <div className="au-frame">
        <section className="au-aside">
          <Link href="/welcome" className="au-brand" aria-label="NexDo home"><NexdoLogo priority /></Link>
          {aside}
          <div className="au-scene" aria-hidden="true" />
        </section>
        <section className="au-panel">{children}</section>
      </div>
    </main>
  );
}

type InputProps = Omit<ComponentProps<'input'>, 'className' | 'id'>;

/** A labelled input with its leading icon inside the box. */
export function AuthField({ label, icon: Icon, code = false, trailing, ...input }: InputProps & { label: string; icon: LucideIcon; code?: boolean; trailing?: ReactNode }) {
  const id = useId();
  return (
    <div className="au-field">
      <label htmlFor={id}>{label}</label>
      <div className={`au-control${code ? ' au-code' : ''}`}>
        <Icon size={19} aria-hidden="true" />
        <input id={id} {...input} />
        {trailing}
      </div>
    </div>
  );
}

/** A password box with a show/hide button, which is why the forms ask for the password once. */
export function AuthPassword({ label, ...input }: Omit<InputProps, 'type'> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const Toggle = visible ? EyeOff : Eye;
  return (
    <AuthField
      label={label}
      icon={Lock}
      type={visible ? 'text' : 'password'}
      trailing={<button type="button" className="au-eye" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible((shown) => !shown)}><Toggle size={19} aria-hidden="true" /></button>}
      {...input}
    />
  );
}

export function AuthButton({ children, ...button }: Omit<ComponentProps<'button'>, 'className'>) {
  return <button className="au-btn" {...button}>{children}<ArrowRight size={20} aria-hidden="true" /></button>;
}

export function AuthAlert({ kind, children }: { kind: 'error' | 'ok'; children: ReactNode }) {
  return <p className={`au-alert au-alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}
