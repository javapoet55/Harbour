import { Authed } from '@/components/authed';
import { ShoppingScreen } from '@/components/shopping-screen';

export default function ShoppingPage() {
  return (
    <Authed>
      <ShoppingScreen />
    </Authed>
  );
}
