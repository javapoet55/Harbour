import {
  isCodeComplete,
  passwordResetConfirmSchema,
  sanitizeCode,
  signInSchema,
  signUpSchema,
  utf8Length,
  verifyEmailSchema,
} from './auth';

describe('signInSchema', () => {
  it('accepts an email address and any non-empty password', () => {
    const result = signInSchema.safeParse({ email: 'person@example.com', password: 'short' });
    expect(result.success).toBe(true);
  });

  it('trims and lowercases the email, as the server does', () => {
    const result = signInSchema.parse({ email: '  Person@Example.COM ', password: 'secret' });
    expect(result.email).toBe('person@example.com');
  });

  it('rejects an invalid email address', () => {
    const result = signInSchema.safeParse({ email: 'not-an-email', password: 'secret' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty password', () => {
    const result = signInSchema.safeParse({ email: 'person@example.com', password: '' });
    expect(result.success).toBe(false);
  });

  it('does not apply the 12-character rule, so existing accounts can still sign in', () => {
    expect(signInSchema.safeParse({ email: 'person@example.com', password: 'a' }).success).toBe(true);
  });
});

describe('signUpSchema', () => {
  const valid = { name: 'Sri', email: 'person@example.com', password: 'correct-horse-battery', confirmation: 'correct-horse-battery' };

  it('accepts a complete form', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects an invalid email address', () => {
    const result = signUpSchema.safeParse({ ...valid, email: 'person@' });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 12 characters', () => {
    const result = signUpSchema.safeParse({ ...valid, password: 'elevenchar', confirmation: 'elevenchar' });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.message.includes('at least 12 characters'))).toBe(true);
  });

  it('rejects a password over 72 UTF-8 bytes, matching validatePassword on the server', () => {
    const emoji = '🔒'.repeat(19); // 76 bytes, 19 characters
    const result = signUpSchema.safeParse({ ...valid, password: emoji, confirmation: emoji });
    expect(result.success).toBe(false);
  });

  it('rejects a mismatched confirmation, and reports it on the confirmation field', () => {
    const result = signUpSchema.safeParse({ ...valid, confirmation: 'something-else-here' });
    expect(result.success).toBe(false);
    const issue = result.error?.issues.find((candidate) => candidate.path[0] === 'confirmation');
    expect(issue?.message).toBe('The passwords do not match.');
  });

  it('rejects a blank name', () => {
    expect(signUpSchema.safeParse({ ...valid, name: '   ' }).success).toBe(false);
  });
});

describe('verifyEmailSchema', () => {
  it('accepts exactly six digits', () => {
    expect(verifyEmailSchema.safeParse({ code: '123456' }).success).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', ''])('rejects %p', (code) => {
    expect(verifyEmailSchema.safeParse({ code }).success).toBe(false);
  });
});

describe('passwordResetConfirmSchema', () => {
  it('accepts a six-digit code with a matching new password', () => {
    const result = passwordResetConfirmSchema.safeParse({ code: '123456', password: 'a-long-enough-one', confirmation: 'a-long-enough-one' });
    expect(result.success).toBe(true);
  });

  it('rejects a mismatched confirmation', () => {
    const result = passwordResetConfirmSchema.safeParse({ code: '123456', password: 'a-long-enough-one', confirmation: 'different-but-long' });
    expect(result.success).toBe(false);
  });

  it('rejects a short new password', () => {
    expect(passwordResetConfirmSchema.safeParse({ code: '123456', password: 'short', confirmation: 'short' }).success).toBe(false);
  });
});

describe('VerificationCode helpers', () => {
  it('strips non-digits and caps at six, as VerificationCode.sanitized does', () => {
    expect(sanitizeCode('12-34 56')).toBe('123456');
    expect(sanitizeCode('1234567890')).toBe('123456');
    expect(sanitizeCode('abc')).toBe('');
  });

  it('accepts a pasted code with surrounding whitespace', () => {
    expect(sanitizeCode(' 123456 ')).toBe('123456');
  });

  it('reports completeness only for six digits', () => {
    expect(isCodeComplete('123456')).toBe(true);
    expect(isCodeComplete('12345')).toBe(false);
  });
});

describe('utf8Length', () => {
  it('counts bytes, not characters', () => {
    expect(utf8Length('abc')).toBe(3);
    expect(utf8Length('é')).toBe(2);
    expect(utf8Length('🔒')).toBe(4);
  });
});
