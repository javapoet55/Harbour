if (!process.env.HARBOR_DATABASE_URL?.includes('nexdo-tests-')) {
  throw new Error('Integration tests require an isolated Nexdo test database.');
}
process.env.HARBOR_SESSION_SECRET ||= 'harbor-test-session';
