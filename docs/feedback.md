# Customer feedback

My Page → Feedback collects a required title (160 characters maximum), description (5,000 maximum), and 1–5-star rating. A thank-you alert appears only after the server acknowledges persistence; failures retain the draft for retry.

`POST /api/feedback` requires customer authentication. The server derives customer identity and the submission timestamp. The client keeps a UUID for retries, preventing duplicate records after a lost response.

Super Admin → Feedback uses the admin-authenticated `GET /api/admin/feedback` endpoint. Records are sorted by submission date descending, then ID descending for stable pagination (50 per page). The table includes customer name, title, description, date given (UTC), and stars. Older feedback and latest-feedback navigation are provided. Responses are not cached.

Deploy the backend migration `20260927150000_customer_feedback`, the backend API, the admin frontend, and a new iOS build together. No production migration is run by local tests. The SQLite migration mirrors the production table for integration tests. Feedback is removed on hard deletion of its owning user.
