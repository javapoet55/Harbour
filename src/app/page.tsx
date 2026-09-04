import { Authed } from '@/components/authed';
import { TodayBoard } from '@/components/today-board';

export default function HomePage() {
  return (
    <Authed>
      <TodayBoard />
    </Authed>
  );
}
