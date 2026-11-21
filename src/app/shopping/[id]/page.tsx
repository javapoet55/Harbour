import { Authed } from '@/components/authed';
import { ShoppingDetail } from '@/components/shopping-detail';

export default async function ShoppingListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Authed>
      <ShoppingDetail id={id} />
    </Authed>
  );
}
