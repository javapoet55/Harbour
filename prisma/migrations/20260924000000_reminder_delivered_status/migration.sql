-- Reminder.status gains the terminal value DELIVERED: the reminder reached the user and no channel is
-- left to escalate to. Before this, such reminders stayed QUEUED and the tick re-scanned them forever.
-- Data only; Reminder.status is a plain string column, so no schema change.
--
-- Backfill mirrors escalationExhausted (src/lib/escalation.ts) so no reminder that could still escalate
-- is closed early. Anything this leaves QUEUED is settled by the next tick under the same rule.

-- Test notices from Settings are never escalated or retried.
UPDATE "Reminder" SET "status" = CASE WHEN EXISTS (
    SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."status" IN ('SENT', 'DELIVERED', 'OPENED')
  ) THEN 'DELIVERED' ELSE 'FAILED' END
WHERE "idempotencyKey" LIKE 'test:%' AND "status" IN ('SCHEDULED', 'QUEUED', 'RETRYING');

UPDATE "Reminder" SET "status" = 'DELIVERED'
WHERE "status" IN ('QUEUED', 'RETRYING')
  AND EXISTS (SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."status" IN ('SENT', 'DELIVERED', 'OPENED'))
  AND (
    EXISTS (SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."status" = 'OPENED')
    OR EXISTS (
      SELECT 1 FROM "UserPreference" p WHERE p."userId" = "Reminder"."userId"
        AND (NOT p."pushEnabled" OR EXISTS (
          SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'push'
            AND (a."status" IN ('SENT', 'DELIVERED', 'OPENED') OR (a."status" = 'FAILED' AND a."failureReason" IN ('No browser push subscription is registered', 'Push provider is not configured', 'No SMS phone number configured', 'Twilio sender or auth token is not configured')))
        ) OR (SELECT COUNT(*) FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'push' AND a."status" = 'FAILED') >= 5)
        AND (NOT p."emailEnabled" OR EXISTS (
          SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'email'
            AND (a."status" IN ('SENT', 'DELIVERED', 'OPENED') OR (a."status" = 'FAILED' AND a."failureReason" IN ('No browser push subscription is registered', 'Push provider is not configured', 'No SMS phone number configured', 'Twilio sender or auth token is not configured')))
        ) OR (SELECT COUNT(*) FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'email' AND a."status" = 'FAILED') >= 5)
        AND (NOT (p."smsEnabled" AND "Reminder"."critical") OR EXISTS (
          SELECT 1 FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'sms'
            AND (a."status" IN ('SENT', 'DELIVERED', 'OPENED') OR (a."status" = 'FAILED' AND a."failureReason" IN ('No browser push subscription is registered', 'Push provider is not configured', 'No SMS phone number configured', 'Twilio sender or auth token is not configured')))
        ) OR (SELECT COUNT(*) FROM "NotificationAttempt" a WHERE a."reminderId" = "Reminder"."id" AND a."channel" = 'sms' AND a."status" = 'FAILED') >= 5)
    )
  );
