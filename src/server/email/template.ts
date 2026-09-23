// Shared branded layout for every Nexdo transactional email.
// Table-based with inline styles only, so it renders in Gmail, Outlook desktop and Apple Mail.

const PRODUCTION_APP_URL = 'https://harbour-production-f8a0.up.railway.app';
export const EMAIL_LOGO_PATH = '/email/nexdo-logo-email.png';

const colors = {
  primary: '#2F6BFF', violet: '#7B4DFF', pink: '#E84CA8',
  heading: '#0B0B2E', body: '#3C3C50', muted: '#6B6B80',
  background: '#F5F6FA', card: '#FFFFFF', codeCard: '#F0F3FF', codeBorder: '#DCE3FF',
};
const fontStack = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";
const monoStack = "ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono','Courier New',monospace";

export type EmailTemplateInput = {
  /** Inbox preview text; hidden in the body. */
  preheader: string;
  heading: string;
  /** Short line directly under the heading, e.g. a due date. */
  subheading?: string;
  intro: string;
  /** One-time code shown in the code card, with its lifetime, e.g. "15 minutes". */
  code?: { value: string; expiresIn: string };
  body?: string[];
  /** Why the recipient is getting this email. */
  footerNote: string;
  /** Shown only where the recipient may not have asked for the email. */
  ignoreNote?: string;
  /** An image under the heading, e.g. `cid:` for an inline MIME part. Omitted from the text version. */
  image?: { src: string; alt: string; width: number; height?: number };
  /** Hide the "Questions?" support line, for mail a Nexdo user sends to someone else. Default true. */
  showSupport?: boolean;
};

export type RenderedEmail = { html: string; text: string };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}

/** Public origin that serves /public assets. APP_URL, falling back to the production deployment. */
export function emailAppUrl() {
  const configured = process.env.APP_URL?.trim();
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === 'https:' || url.protocol === 'http:') return url.origin;
    } catch { /* fall through to the production default */ }
  }
  return PRODUCTION_APP_URL;
}

export function emailSupportAddress() {
  return (process.env.EMAIL_SUPPORT_ADDRESS || process.env.EMAIL_FROM_ADDRESS || process.env.SENDGRID_FROM_EMAIL || '').trim() || undefined;
}

export function renderEmail(input: EmailTemplateInput): RenderedEmail {
  return { html: renderHtml(input), text: renderText(input) };
}

function paragraph(text: string, style: string) {
  return `<p style="margin:0 0 16px;${style}">${escapeHtml(text)}</p>`;
}

function renderHtml(input: EmailTemplateInput) {
  const logoUrl = `${emailAppUrl()}${EMAIL_LOGO_PATH}`;
  const support = input.showSupport === false ? undefined : emailSupportAddress();
  const bodyText = `font-family:${fontStack};font-size:15px;line-height:24px;color:${colors.body};`;
  const footerText = `font-family:${fontStack};font-size:12px;line-height:18px;color:${colors.muted};`;
  // Zero-width padding keeps body copy from leaking into the inbox preview after the preheader.
  const previewPad = '&#847;&zwnj;&nbsp;'.repeat(60);

  const code = input.code ? `
<tr><td style="padding:8px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;">
<tr><td align="center" bgcolor="${colors.codeCard}" style="background-color:${colors.codeCard};border:1px solid ${colors.codeBorder};border-radius:10px;padding:20px 12px;">
<div style="font-family:${monoStack};font-size:32px;line-height:40px;font-weight:700;letter-spacing:6px;padding-left:6px;color:${colors.heading};">${escapeHtml(input.code.value)}</div>
<div style="font-family:${fontStack};font-size:13px;line-height:20px;color:${colors.muted};padding-top:8px;">Expires in ${escapeHtml(input.code.expiresIn)} &middot; single use</div>
</td></tr>
</table>
</td></tr>` : '';

  const body = (input.body ?? []).map((line) => paragraph(line, bodyText)).join('');
  // Scales down to the 496px content column; the height follows the width on narrow screens.
  const image = input.image ? `
<tr><td align="center" style="padding:8px 0 20px;"><img src="${escapeHtml(input.image.src)}" width="${Math.min(input.image.width, 496)}" alt="${escapeHtml(input.image.alt)}" style="display:block;width:100%;max-width:${Math.min(input.image.width, 496)}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;font-family:${fontStack};font-size:15px;color:${colors.body};"></td></tr>` : '';

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.heading)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;width:100%;background-color:${colors.background};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${colors.background};">${escapeHtml(input.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.background}" style="background-color:${colors.background};">
<tr><td align="center" style="padding:32px 16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;margin:0 auto;">
<tr><td align="left" style="padding:0 0 24px;">
<img src="${escapeHtml(logoUrl)}" width="206" height="48" alt="Nexdo" style="display:block;width:206px;height:48px;max-width:206px;border:0;outline:none;text-decoration:none;font-family:${fontStack};font-size:22px;font-weight:700;color:${colors.heading};">
</td></tr>
<tr><td bgcolor="${colors.card}" style="background-color:${colors.card};border-radius:12px;overflow:hidden;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td height="4" bgcolor="${colors.primary}" style="height:4px;line-height:4px;font-size:0;background-color:${colors.primary};background-image:linear-gradient(90deg,${colors.primary},${colors.violet},${colors.pink});border-radius:12px 12px 0 0;">&nbsp;</td></tr>
<tr><td style="padding:32px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:0 0 12px;"><h1 style="margin:0;font-family:${fontStack};font-size:24px;line-height:32px;font-weight:700;color:${colors.heading};">${escapeHtml(input.heading)}</h1>${input.subheading ? `<p style="margin:4px 0 0;font-family:${fontStack};font-size:15px;line-height:22px;font-weight:600;color:${colors.primary};">${escapeHtml(input.subheading)}</p>` : ''}</td></tr>${image}
<tr><td>${paragraph(input.intro, bodyText)}</td></tr>${code}
${body ? `<tr><td style="padding-top:24px;">${body}</td></tr>` : ''}
</table>
</td></tr>
</table>
</td></tr>
<tr><td style="padding:24px 32px 0;">
${paragraph(input.footerNote, `${footerText}margin-bottom:8px;`)}${input.ignoreNote ? paragraph(input.ignoreNote, `${footerText}margin-bottom:8px;`) : ''}
<p style="margin:16px 0 4px;font-family:${fontStack};font-size:14px;line-height:20px;font-weight:700;color:${colors.heading};">Nexdo</p>
${support ? `<p style="margin:0;${footerText}">Questions? <a href="mailto:${escapeHtml(support)}" style="color:${colors.primary};text-decoration:underline;">${escapeHtml(support)}</a></p>` : ''}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}

function renderText(input: EmailTemplateInput) {
  const support = input.showSupport === false ? undefined : emailSupportAddress();
  const sections = [
    'Nexdo',
    input.subheading ? `${input.heading}
${input.subheading}` : input.heading,
    input.intro,
    input.code ? `Your code is ${input.code.value}.\nExpires in ${input.code.expiresIn} · single use` : '',
    ...(input.body ?? []),
    [input.footerNote, input.ignoreNote].filter(Boolean).join('\n'),
    ['Nexdo', support ? `Questions? ${support}` : ''].filter(Boolean).join('\n'),
  ];
  return `${sections.filter(Boolean).join('\n\n')}\n`;
}
