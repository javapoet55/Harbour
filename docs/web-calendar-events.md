# Web Calendar: events and conflicts

No server change. Files: `src/components/calendar-events.tsx`, `src/lib/calendar-events.ts`, `src/components/calendar-screen.tsx`.

- **New event**: the calendar-plus button in the Calendar header opens the same New Event sheet as Quick Add (`POST /api/calendar/events`). A schedule conflict is asked about before saving, and the event is sent to a connected calendar like any other.
- **Appointment details**: tap an appointment. It loads the full event (`GET /api/calendar/events/:id`). Events made in Nexdo can be edited (`PATCH`: title, start/end including another day, location, notes) or deleted (`DELETE`, with a confirm). Imported events (Google, Outlook) are read-only here; edit them in their calendar. Only changed fields are sent, so a past event can still be renamed; a moved event must start in the future and last at most seven days (server rules).
- **Conflicts**: the Schedule Intelligence card ("Review conflicts", "Fix my schedule") now shows on Week and Month as well as Schedule.

Not built: marking an event completed (the agenda payload does not carry it), repeat editing, all-day event creation.
