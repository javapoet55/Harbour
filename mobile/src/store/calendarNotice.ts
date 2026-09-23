import { create } from 'zustand';

import type { CalendarPushNotice } from '../lib/calendarPush';

/**
 * The latest calendar write-back note. New Event closes as soon as it saves, and the voice screen can
 * create an event mid-conversation, so the note lives here and `CalendarPushNote` shows it on the
 * Calendar tab and the voice screen. It is shown only to the account that made the event.
 */
type CalendarNoticeStore = {
  notice: (CalendarPushNotice & { ownerId: string }) | null;
  show: (notice: CalendarPushNotice | null, ownerId: string | null | undefined) => void;
  clear: () => void;
};

export const useCalendarNotice = create<CalendarNoticeStore>()((set) => ({
  notice: null,
  show: (notice, ownerId) => {
    if (notice && ownerId) set({ notice: { ...notice, ownerId } });
  },
  clear: () => set({ notice: null }),
}));
