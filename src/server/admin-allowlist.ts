const defaultAdminEmails = ['jsriramk@mail.com', 'jsriramk@gmail.com'];

export function adminEmails() {
  const configured = (process.env.NEXDO_ADMIN_EMAILS ?? '').split(',');
  return new Set([...defaultAdminEmails, ...configured].map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && adminEmails().has(email.trim().toLowerCase()));
}

