# Security and privacy

- Passwords are bcrypt hashes. Sessions are signed JWTs in HTTP-only cookies.
- Assistant answers come only from the authenticated user’s rows.
- Harbor does not store raw audio in this MVP. Transcripts can be deleted by resetting the demo database; production should honor `transcriptRetentionDays`.
- Provider tokens for Google/Outlook live on `CalendarConnection` and must be encrypted at rest before a public deploy.
- Logs record intent names, reminder statuses, and sync counts — not task notes, tokens, or audio.
- Quiet hours and confirmation settings are user-controlled.
- Never overwrite an external calendar event unless the connection is `writeEnabled` and the user confirmed the change.
