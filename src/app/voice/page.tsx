import { Authed } from '@/components/authed';

export default function VoicePage() {
  return (
    <Authed>
      <h1 className="text-3xl font-semibold">Voice</h1>
      <p className="mt-2 max-w-xl text-[var(--muted)]">
        The microphone lives on every screen. On a phone, this page keeps it front and center — press the red listening button below and ask what you have today.
      </p>
    </Authed>
  );
}
