# Explicit scheduling

User-chosen task and appointment times now check actual occupied intervals only.
Working hours, weekends, buffer-only proximity and unrelated sync/protected-link
warnings do not block saving. Touching endpoints are allowed. Actual task, calendar
and active focus overlaps still require approval, including overlaps within a
recurring series. Edits exclude the task being edited; finished/cancelled tasks do
not occupy time. Saved task duration is used instead of a personalized planning
estimate.

Automatic suggestions, replanning and protected-time proposal validation retain
their existing working-hours, buffer and freshness policies.

Both conversational and calendar-only voice instructions ask for one brief final
confirmation of the title/time/duration. Once agreed, the creation tool must run
immediately. Already-confirmed details must not trigger another confirmation.
Actual overlap approval remains separate; success is announced only after saving.
Future-date validation, ownership checks and idempotency remain unchanged.

Validation: 79 tests cover voice tools, explicit scheduling, recurring bookings,
time instructions, conversational actions and automatic replanning. TypeScript
checking passes. Live model speech behavior still needs device validation.
No migration or iOS client change is required; backend deployment is required.
