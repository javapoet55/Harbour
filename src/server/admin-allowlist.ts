// Administrators come only from NEXDO_ADMIN_EMAILS (comma-separated, trimmed, case-insensitive).
// Unset or empty means nobody can sign in to the admin portal.
export function adminEmails() {
  const configured = (process.env.NEXDO_ADMIN_EMAILS ?? '').split(',');
  return new Set(configured.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && adminEmails().has(email.trim().toLowerCase()));
}
