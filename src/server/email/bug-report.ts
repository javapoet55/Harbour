import { renderEmail } from './template';

/** Only the approved diagnostic fields are included, never arbitrary stored metadata. */
export function bugReportMessage(input: {
  reference: string;
  description: string;
  metadata: string;
  screenshotUrl?: string;
}) {
  let metadata: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(input.metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) metadata = parsed;
  } catch { /* Legacy reports can still be delivered without diagnostics. */ }
  const value = (key: string) => typeof metadata[key] === 'string' ? metadata[key] as string : 'Not available';
  const timestamp = new Date(value('timestamp'));
  const received = Number.isNaN(+timestamp) ? 'Not available' : new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long', timeStyle: 'long', timeZone: 'UTC',
  }).format(timestamp);
  let screenshotUrl: string | undefined;
  try {
    const url = new URL(input.screenshotUrl ?? '');
    if (url.protocol === 'https:' && !url.username && !url.password) screenshotUrl = url.href;
  } catch { /* No valid protected screenshot link. */ }
  return {
    subject: `NexDo bug report ${input.reference}`,
    ...renderEmail({
      heading: 'New bug report',
      subheading: `Reference ID · ${input.reference}`,
      preheader: `Bug report ${input.reference} is ready for review.`,
      intro: 'A user reported an issue in NexDo. Review the description and diagnostic details below.',
      sections: [
        { title: 'What happened', items: [input.description] },
        { title: 'Diagnostic details', items: [], details: [
          { label: 'App version', value: value('appVersion') },
          { label: 'Build number', value: value('buildNumber') },
          { label: 'Device model', value: value('deviceModel') },
          { label: 'iOS version', value: value('iosVersion') },
          { label: 'App screen', value: value('screen') },
          { label: 'Reported at (UTC)', value: received },
          { label: 'Correlation ID', value: value('correlationID') },
        ] },
        { title: 'Screenshot', items: [screenshotUrl
          ? 'Included with user consent. Authorized support sign-in is required. Screenshots expire 7 days after submission.'
          : 'No screenshot is available for this report.'] },
      ],
      action: screenshotUrl ? { label: 'View screenshot', url: screenshotUrl } : undefined,
      footerNote: 'Sent to NexDo Support. Use the reference ID above when tracking this issue.',
      ignoreNote: 'Reports are retained for 90 days. Screenshots are retained for 7 days. No full diagnostic logs are included.',
      supportContact: false,
    }),
  };
}
