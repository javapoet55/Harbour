import { describe, expect, it } from 'vitest';
import { bugReportMessage } from './bug-report';

const input = {
  reference: 'BR-925109', description: 'First line\nSecond <script>alert(1)</script>',
  metadata: JSON.stringify({ appVersion: '1.0.1', buildNumber: '7', deviceModel: 'iPhone16,2', iosVersion: '27.0', screen: 'today', timestamp: '2026-10-10T18:56:47Z', correlationID: 'anonymous-id', password: 'must-not-appear' }),
};
describe('bug report email', () => {
  it('formats approved diagnostics and preserves escaped multiline descriptions in both formats', () => {
    const email = bugReportMessage(input);
    expect(email.subject).toBe('NexDo bug report BR-925109');
    expect(email.html).toContain('Reference ID · BR-925109');
    expect(email.html).toContain('First line<br>Second &lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain('App version: 1.0.1');
    expect(email.text).toContain('October 10, 2026');
    expect(email.text).toContain('UTC');
    expect(email.html).not.toContain('must-not-appear');
    expect(email.text).not.toContain('must-not-appear');
    expect(email.html).toContain('No screenshot is available');
  });
  it('uses a protected screenshot button without displaying the raw URL', () => {
    const url = 'https://admin.nexdoapp.com/api/admin/feedback/bugs/123/screenshot';
    const email = bugReportMessage({ ...input, screenshotUrl: url });
    expect(email.html).toContain(`href="${url}"`);
    expect(email.html).toContain('>View screenshot</a>');
    expect(email.html).not.toContain(`>${url}<`);
    expect(email.text).toContain(`View screenshot: ${url}`);
    expect(email.text).toContain('Authorized support sign-in');
  });
  it.each(['javascript:alert(1)', 'http://unsafe.test', 'https://user:password@example.com'])('omits unsafe screenshot links: %s', screenshotUrl => {
    const email = bugReportMessage({ ...input, screenshotUrl });
    expect(email.html).not.toContain('>View screenshot</a>');
    expect(email.text).not.toContain('View screenshot:');
  });
  it('delivers legacy reports with missing or malformed diagnostics', () => {
    for (const metadata of ['bad json', 'null', '{}']) {
      const email = bugReportMessage({ ...input, metadata });
      expect(email.text).toContain('App version: Not available');
      expect(email.text).toContain('Reported at (UTC): Not available');
    }
  });
});
