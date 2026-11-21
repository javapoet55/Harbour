import { Authed } from '@/components/authed';
import { MomentsScreen } from '@/components/moments-screen';

export default function MomentsPage() {
  return (
    <Authed>
      <MomentsScreen />
    </Authed>
  );
}
