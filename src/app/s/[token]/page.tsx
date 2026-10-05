import SharedShopping from '@/app/shared/shopping/[token]/page';
import { decodeShoppingShareToken } from '@/server/shopping/share-link';
import { notFound } from 'next/navigation';
export { metadata } from '@/app/shared/shopping/[token]/page';
export const dynamic = 'force-dynamic';
export default async function ShortShoppingShare({ params }: { params: Promise<{ token: string }> }) {
  const token = decodeShoppingShareToken((await params).token);
  if (!token) notFound();
  return SharedShopping({ params: Promise.resolve({ token }) });
}
