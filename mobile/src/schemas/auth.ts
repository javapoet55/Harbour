import { z } from 'zod';

/**
 * Auth form rules.
 *
 * The web app has no shared Zod schemas for auth — `src/app/signup/page.tsx` and the other web auth
 * pages validate with plain HTML attributes — so these are derived from the two authorities instead:
 *
 * - `src/server/account-auth.ts`: `emailSchema` (trim, lowercase, email, max 254),
 *   `nameSchema` (trim, 1–100), `validatePassword` (>= 12 characters, <= 72 UTF-8 bytes),
 *   and the `/^\d{6}$/` code test in `verifyEmail` / `resetPassword`.
 * - `ios/App/RootView.swift`: the `canSignIn` / `canCreate` gates and the
 *   "The passwords do not match." message, so the button enables at the same moment as in Swift.
 */

/** `Buffer.byteLength(value, 'utf8')` in src/server/account-auth.ts:19, without Node's Buffer. */
export function utf8Length(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const point = character.codePointAt(0) ?? 0;
    if (point < 0x80) bytes += 1;
    else if (point < 0x800) bytes += 2;
    else if (point < 0x10000) bytes += 3;
    else bytes += 4;
  }
  return bytes;
}

export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 12;
export const CODE_LENGTH = 6;

/** Matches src/server/account-auth.ts:6 `z.string().trim().toLowerCase().email().max(254)`. */
const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, 'Enter a valid email address.')
  .refine((value) => z.string().email().safeParse(value).success, 'Enter a valid email address.');

/** Matches src/server/account-auth.ts:7 `z.string().trim().min(1).max(100)`. */
const name = z.string().trim().min(1, 'Enter your name.').max(100, 'Enter a name of 100 characters or fewer.');

/** Matches src/server/account-auth.ts:18–23 `validatePassword`. */
const newPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.`)
  .refine((value) => utf8Length(value) <= MAX_PASSWORD_BYTES, `Use a password of ${MAX_PASSWORD_BYTES} bytes or fewer.`);

/** Matches the `/^\d{6}$/` test the server applies before looking a code up. */
const code = z.string().regex(new RegExp(String.raw`^\d{${CODE_LENGTH}}$`), `Enter the ${CODE_LENGTH}-digit code.`);

/**
 * Sign-in deliberately does not apply the 12-character rule: `canSignIn` in RootView.swift:432 only
 * requires a non-empty password, and an account created before the current policy must still sign in.
 */
export const signInSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password.'),
});

export const signUpSchema = z
  .object({
    name,
    email,
    password: newPassword,
    confirmation: z.string(),
  })
  // RootView.swift:566 `guard password == confirmation else { localError = "The passwords do not match." }`
  .refine((values) => values.password === values.confirmation, {
    message: 'The passwords do not match.',
    path: ['confirmation'],
  });

export const verifyEmailSchema = z.object({ code });

/** Stage one of `PasswordResetView`: the email only. */
export const passwordResetRequestSchema = z.object({ email });

/** Stage two: the emailed code and the new password. */
export const passwordResetConfirmSchema = z
  .object({
    code,
    password: newPassword,
    confirmation: z.string(),
  })
  .refine((values) => values.password === values.confirmation, {
    message: 'The passwords do not match.',
    path: ['confirmation'],
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type VerifyEmailValues = z.infer<typeof verifyEmailSchema>;
export type PasswordResetRequestValues = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetConfirmValues = z.infer<typeof passwordResetConfirmSchema>;

/** `VerificationCode.sanitized` (ios/Sources/NexdoCore/EmailVerification.swift:30–32). */
export function sanitizeCode(value: string): string {
  return value.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
}

/** `VerificationCode.isComplete` (ios/Sources/NexdoCore/EmailVerification.swift:33–35). */
export function isCodeComplete(value: string): boolean {
  return new RegExp(String.raw`^\d{${CODE_LENGTH}}$`).test(value);
}
