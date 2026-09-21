import { renderEmail } from './template';

// Every transactional email Nexdo sends. Subjects are part of the contract with clients and tests.
export type TransactionalEmail = { subject: string; text: string; html: string };

export function verifyEmailMessage(code: string, expiresIn: string): TransactionalEmail {
  return {
    subject: 'Verify your Nexdo email',
    ...renderEmail({
      preheader: `Your Nexdo verification code expires in ${expiresIn}.`,
      heading: 'Verify your email',
      intro: 'Use this code to finish creating your Nexdo account.',
      code: { value: code, expiresIn },
      footerNote: "You're receiving this because a Nexdo account was created with this address.",
      ignoreNote: "If you didn't create a Nexdo account, you can ignore this email.",
    }),
  };
}

export function passwordResetMessage(code: string, expiresIn: string): TransactionalEmail {
  return {
    subject: 'Your Nexdo password reset code',
    ...renderEmail({
      preheader: `Your Nexdo password reset code expires in ${expiresIn}.`,
      heading: 'Reset your password',
      intro: 'Use this code to reset your Nexdo password.',
      code: { value: code, expiresIn },
      footerNote: "You're receiving this because a password reset was requested for the Nexdo account at this address.",
      ignoreNote: "If you didn't request this, you can ignore this email. Your password will not change.",
    }),
  };
}

export function adminSignInMessage(code: string, expiresIn: string): TransactionalEmail {
  return {
    subject: 'Your NEXDO Admin sign-in code',
    ...renderEmail({
      preheader: `Your Nexdo Admin sign-in code expires in ${expiresIn}.`,
      heading: 'Sign in to Nexdo Admin',
      intro: 'Use this code to finish signing in to the Nexdo Admin workspace. Never share this code.',
      code: { value: code, expiresIn },
      footerNote: "You're receiving this because an admin sign-in was requested for this address.",
      ignoreNote: "If you didn't request this, you can ignore this email.",
    }),
  };
}

export function testNotificationMessage(): TransactionalEmail {
  return {
    subject: 'Harbour test notification',
    ...renderEmail({
      preheader: 'Your Nexdo email notifications are working.',
      heading: 'Email notifications are working',
      intro: "This is a test message from your Nexdo notification settings. You're all set.",
      footerNote: "You're receiving this because you sent a test email from your Nexdo notification settings.",
    }),
  };
}

/** `due` is the task's due or scheduled time as the app shows it, e.g. "Due Sep 6, 9:00 AM". */
export function reminderMessage(title: string, when: string, due?: string): TransactionalEmail {
  return {
    subject: title,
    ...renderEmail({
      preheader: due ? `${due} · Reminder: ${when}` : `Reminder: ${when}`,
      heading: title,
      subheading: due,
      intro: `Reminder: ${when}`,
      footerNote: "You're receiving this because email reminders are turned on for your Nexdo account.",
    }),
  };
}
