import Image from 'next/image';

export function NexdoLogo({ compact = false, priority = false }: { compact?: boolean; priority?: boolean }) {
  return <Image src="/nexdo-logo.png" alt="Nexdo — Get More Done with AI" width={1942} height={809} priority={priority} className={`nexdo-logo${compact ? ' nexdo-logo-compact' : ''}`} />;
}
