// Renders every transactional email to output/email-previews/ for visual review. Never sends email.
// Usage: npx tsx scripts/render-email-previews.ts   (set APP_URL to preview against another origin)
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { adminSignInMessage, passwordResetMessage, reminderMessage, testNotificationMessage, verifyEmailMessage } from '../src/server/email/messages';

const outDir = path.resolve(__dirname, '..', 'output', 'email-previews');
mkdirSync(outDir, { recursive: true });
const sampleCode = '042917';
const emails = {
  'verify-email': verifyEmailMessage(sampleCode, '24 hours'),
  'password-reset': passwordResetMessage(sampleCode, '15 minutes'),
  'admin-sign-in': adminSignInMessage(sampleCode, '10 minutes'),
  'test-notification': testNotificationMessage(),
  reminder: reminderMessage('Send the board deck', '1 hour before'),
};
for (const [name, email] of Object.entries(emails)) {
  writeFileSync(path.join(outDir, `${name}.html`), email.html);
  writeFileSync(path.join(outDir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
  console.log(`${name}: ${path.relative(process.cwd(), path.join(outDir, `${name}.html`))}`);
}
