import { Authed } from '@/components/authed';
import { CalendarScreen } from '@/components/calendar-screen';
import './calendar.css';

export default function CalendarPage() {
  return <Authed><CalendarScreen /></Authed>;
}
