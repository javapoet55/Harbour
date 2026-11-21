import { z } from 'zod';

// Zod speeds up parsing by compiling code with the Function constructor when it can, and tests for that
// by constructing a throwaway one. The Content Security Policy forbids evaluating strings as code, so in
// the browser that test fails and is reported as a policy violation on every page. Tell Zod not to try.
// Server-side parsing keeps the fast path. Import this before a schema is first used in the browser.
if (typeof window !== 'undefined') z.config({ jitless: true });
