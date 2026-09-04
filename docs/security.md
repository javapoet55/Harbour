# Security and privacy

- Passwords are bcrypt hashes. Sessions are signed JWTs in HTTP-only cookies.
- Assistant answers come only from the authenticated user’s rows.
- Harbor does not store raw audio in this MVP. Transcripts can be deleted by resetting the demo database; production should honor `transcriptRetentionDays`.
- Provider tokens for Google/Outlook are encrypted with AES-256-GCM using `HARBOR_CREDENTIAL_ENCRYPTION_KEY` before being stored on `CalendarConnection`.
- Logs record intent names, reminder statuses, and sync counts — not task notes, tokens, or audio.
- Quiet hours and confirmation settings are user-controlled.
- Personalized prediction telemetry is opt-in. Models use only activity at or after the latest consent timestamp, expose sample sizes, and can be erased without deleting tasks.
- Production reminder-ticker requests require the `HARBOR_CRON_SECRET` bearer token.
- Never overwrite an external calendar event unless the connection is `writeEnabled` and the user confirmed the change.
