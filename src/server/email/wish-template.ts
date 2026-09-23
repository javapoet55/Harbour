import { colors, escapeHtml, fontStack } from './template';

// A wish goes from the user's own Gmail to a friend, so it is not a Nexdo account email: no logo
// header or support line. The card leads, then the wish and signature, then one small footer line.
// Table-based with inline styles only, like the transactional template.

export type WishEmailInput = {
  subject: string;
  /** The approved wish; blank lines separate paragraphs. */
  body: string;
  signature?: string | null;
  /** The card, e.g. `cid:` for an inline MIME part. */
  card?: { src: string; alt: string; width: number } | null;
};

export const WISH_FOOTER = 'Sent with Nexdo';
const CONTENT_WIDTH = 520;

export function renderWishEmail(input: WishEmailInput) {
  const bodyText = `font-family:${fontStack};font-size:16px;line-height:26px;color:${colors.body};`;
  const paragraphs = input.body.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const signature = input.signature?.trim();
  const width = input.card ? Math.min(input.card.width, CONTENT_WIDTH) : CONTENT_WIDTH;
  const card = input.card ? `
<tr><td align="center" style="padding:0 0 24px;"><img src="${escapeHtml(input.card.src)}" width="${width}" alt="${escapeHtml(input.card.alt)}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:12px;${bodyText}"></td></tr>` : '';
  // Line breaks inside a paragraph are kept.
  const wish = paragraphs.map((part) => `<p style="margin:0 0 16px;${bodyText}">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(input.subject)}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${colors.card};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${colors.card}" style="background-color:${colors.card};">
<tr><td align="center" style="padding:24px 16px;">
<!--[if mso]><table role="presentation" width="${CONTENT_WIDTH}" cellpadding="0" cellspacing="0" border="0" align="center"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${CONTENT_WIDTH}px;margin:0 auto;">${card}
<tr><td align="left">${wish}${signature ? `<p style="margin:8px 0 0;${bodyText}">${escapeHtml(signature)}</p>` : ''}</td></tr>
<tr><td align="left" style="padding:32px 0 0;"><p style="margin:0;font-family:${fontStack};font-size:12px;line-height:18px;color:${colors.muted};">${WISH_FOOTER}</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
}
