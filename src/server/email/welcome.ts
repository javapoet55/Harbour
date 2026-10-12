import { colors, emailAppUrl, emailSupportAddress, EMAIL_LOGO_PATH, escapeHtml, fontStack } from './template';

/** Live text and table layout keep verification usable when email images are blocked. */
export function welcomeEmail(code: string, expiresIn: string) {
  const e = escapeHtml;
  const origin = emailAppUrl();
  const support = emailSupportAddress() || 'support@nexdoapp.com';
  const features = [
    ['ϟ', 'Turn ideas into action', 'Capture, organize and get things done', '#EEE9FF', '#6235FF'],
    ['▦', 'Smarter scheduling', 'Plan your day with AI', '#EEE9FF', '#7435FF'],
    ['✓', 'Stay focused', 'Prioritize what matters most', '#E1F8EB', '#00A85A'],
    ['✦', 'Get AI support', 'Break down tasks and find next steps', '#FCE7F7', '#D819B5'],
  ];
  const tips = [
    ['1. Capture everything', 'Tasks, notes and ideas — in one place.'],
    ['2. Let AI help', 'Get personalized suggestions and next steps.'],
    ['3. Stay consistent', 'A clearer day leads to bigger results.'],
  ];
  const featureCards = features.map(([icon, title, copy, bg, accent]) => `<div style="display:inline-block;width:50%;min-width:140px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:12px 10px 16px 0;"><div aria-hidden="true" style="width:44px;line-height:44px;border-radius:14px;background:${bg};color:${accent};font-size:28px;text-align:center;">${icon}</div><h3 style="margin:10px 0 5px;font-size:15px;line-height:21px;color:${colors.heading};">${title}</h3><p style="margin:0;font-size:13px;line-height:20px;color:${colors.muted};">${copy}</p></td></tr></table></div>`).join('');
  const tipCards = tips.map(([title, copy]) => `<div style="display:inline-block;width:100%;max-width:194px;vertical-align:top;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:10px 16px 8px 0;"><h3 style="margin:0 0 5px;font-size:14px;line-height:21px;color:${colors.heading};">${title}</h3><p style="margin:0;font-size:14px;line-height:21px;color:${colors.muted};">${copy}</p></td></tr></table></div>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Welcome to NexDo — verify your email</title></head>
<body style="margin:0;padding:0;background:${colors.background};font-family:${fontStack};color:${colors.heading};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Nexdo verification code expires in ${e(expiresIn)}.${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.background}"><tr><td align="center" style="padding:24px 12px;">
<!--[if mso]><table role="presentation" width="680"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;">
<tr><td style="padding:28px 24px 16px;border-radius:24px 24px 0 0;background:#F4F2FF;background-image:linear-gradient(120deg,#FFFFFF,#F8F0FF,#EDF5FF);">
<img src="${e(origin + EMAIL_LOGO_PATH)}" width="206" height="48" alt="Nexdo" style="display:block;width:206px;height:48px;max-width:206px;border:0;">
<p style="margin:10px 0 30px;font-size:14px;line-height:22px;color:${colors.muted};">Less on your mind, more done in your day.</p>
<h1 style="margin:0 0 12px;font-size:36px;line-height:43px;letter-spacing:-1px;">Welcome to <span style="color:#7037FF;">NexDo!</span></h1>
<p style="margin:0 0 16px;font-size:19px;line-height:28px;color:${colors.muted};">Your personal AI-powered productivity assistant is almost ready.</p>
<div style="font-size:0;">${featureCards}</div>
</td></tr>
<tr><td style="padding:28px 24px;background:#FFFFFF;border-radius:20px;">
<h2 style="margin:0 0 8px;font-size:26px;line-height:34px;">Verify your email</h2>
<p style="margin:0 0 20px;font-size:16px;line-height:25px;color:${colors.muted};">Use this code to finish creating your NexDo account.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#F0F3FF" style="padding:20px 8px;border:1px solid #DCE3FF;border-radius:12px;">
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:6px;padding-left:6px;color:${colors.heading};">${e(code)}</div>
<div style="font-size:13px;line-height:20px;color:${colors.muted};padding-top:8px;">Expires in ${e(expiresIn)} &middot; single use</div>
</td></tr></table>
<table role="presentation" align="center" cellpadding="0" cellspacing="0" style="margin:20px auto 0;"><tr><td align="center" bgcolor="#6235FF" style="border-radius:12px;background-image:linear-gradient(90deg,#2F8AFF,#7037FF,#E524CC);"><a href="${e(origin + '/')}" style="display:inline-block;padding:15px 48px;border-radius:12px;font-size:17px;line-height:24px;font-weight:700;color:#FFFFFF;text-decoration:none;">Open NexDo</a></td></tr></table>
</td></tr>
<tr><td height="14" style="font-size:0;line-height:14px;">&nbsp;</td></tr>
<tr><td style="padding:24px;background:#FFFFFF;border-radius:20px;">
<h2 style="margin:0 0 12px;font-size:19px;line-height:27px;">Pro tips to get the most out of NexDo</h2>
<div style="font-size:0;">${tipCards}</div>
</td></tr>
<tr><td style="padding:24px 24px 0;font-size:12px;line-height:20px;color:${colors.muted};">
<p style="margin:0 0 6px;">You're receiving this because a Nexdo account was created with this address.</p>
<p style="margin:0 0 20px;">If you didn't create a Nexdo account, you can ignore this email.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #DCE3FF;"><tr><td style="padding-top:18px;">
<strong style="font-size:18px;color:${colors.heading};">NexDo</strong><br>Less on your mind, more done in your day.
<p style="margin:12px 0 0;">Questions? <a href="mailto:${e(support)}" style="color:#2F6BFF;">${e(support)}</a></p>
</td></tr></table></td></tr></table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [
    'Welcome to NexDo!', 'Less on your mind, more done in your day.',
    'Your personal AI-powered productivity assistant is almost ready.',
    ...features.map(([, title, copy]) => `${title}: ${copy}`),
    'Verify your email', 'Use this code to finish creating your NexDo account.',
    `Your code is ${code}.\nExpires in ${expiresIn} · single use`, `Open NexDo: ${origin}/`,
    'Pro tips to get the most out of NexDo', ...tips.map(([title, copy]) => `${title}\n${copy}`),
    "You're receiving this because a Nexdo account was created with this address.",
    "If you didn't create a Nexdo account, you can ignore this email.", `Questions? ${support}`,
  ].join('\n\n') + '\n';
  return { html, text };
}
