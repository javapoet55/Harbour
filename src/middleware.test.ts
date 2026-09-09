import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('expired session navigation', () => {
  it('leaves authentication failures to JSON APIs instead of redirecting to an HTML login', () => {
    expect(middleware(new NextRequest('http://localhost/api/assistant')).headers.get('location')).toBeNull();
  });
  it('never treats the mere existence of an invalid cookie as a reason to leave login', () => {
    expect(middleware(new NextRequest('http://localhost/login', { headers: { cookie: 'harbor_session=expired' } })).headers.get('location')).toBeNull();
    expect(middleware(new NextRequest('http://localhost/tasks')).headers.get('location')).toBe('http://localhost/login');
  });
});
