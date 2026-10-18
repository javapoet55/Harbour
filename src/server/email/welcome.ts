import { colors, emailAppUrl, emailSupportAddress, escapeHtml, fontStack } from './template';

const appStore = 'https://apps.apple.com/us/app/nexdo-ai-planner/id6812225981';
const features = [
  ['01-smart-todos', 'Smart To-Do’s', 'Capture, organize and get things done with AI.', '#EFF7FF'],
  ['02-calendar-reminders', 'Calendar & Reminders', 'Plan your day and never miss a thing.', '#FCF0FC'],
  ['03-shopping-lists', 'Shopping Lists', 'Create lists, find nearby stores and even send them.', '#EDFAF3'],
  ['04-moments', 'Moments', 'Capture special memories, notes and milestones.', '#F5F0FF'],
  ['05-calorie-tracker', 'Calorie Tracker', 'Log meals easily and stay on track with your goals.', '#FFF6EC'],
  ['06-pomodoro-focus', 'Pomodoro Focus', 'Stay focused and be more productive.', '#F4F0FF'],
  ['07-ai-assistant', 'AI Assistant', 'Just ask to create tasks, plan, find answers and more.', '#EDFAFF'],
  ['08-find-nearby', 'Find Nearby', 'Discover nearby stores, services and places.', '#FFF8EF'],
  ['09-share-collaborate', 'Share & Collaborate', 'Share lists and plans with family and friends.', '#FCF0FC'],
  ['10-sync-devices', 'Sync Across Devices', 'Access everything on all your devices, anytime.', '#EFF7FF'],
];

/** Signup and verification resends share this template. OTP and all copy remain live text. */
export function welcomeEmail(code: string, expiresIn: string) {
  const e = escapeHtml;
  const base = emailAppUrl() + '/email/welcome-v2/';
  const support = emailSupportAddress() || 'support@nexdoapp.com';
  const img = (name: string, width: number, alt = '') => `<img src="${e(base + name + '.png')}" width="${width}" alt="${e(alt)}" style="display:block;border:0;max-width:100%;height:auto;margin:0 auto;">`;
  const highlights = [
    ['hero-organize', 'Organize your day'], ['hero-get-things-done', 'Get things done'],
    ['hero-capture-moments', 'Capture moments'], ['hero-sparkle', 'Live a happier life'],
  ];
  const cards = features.map(([asset, title, copy, bg], i) => `<div style="display:inline-block;width:20%;min-width:120px;max-width:160px;vertical-align:top;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:5px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${bg}" style="border-radius:18px;"><tr><td align="center" valign="top" height="205" style="padding:12px 8px;color:${colors.heading};"><div style="font-size:12px;color:#59658C;text-align:left;">${i + 1}</div>${img(asset + '-recreated', 48)}<h3 style="font-size:13px;line-height:18px;margin:12px 0 6px;">${title}</h3><p style="font-size:12px;line-height:17px;margin:0;color:${colors.muted};">${copy}</p></td></tr></table></td></tr></table></div>`).join('');
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>Welcome to NexDo — verify your email</title></head>
<body style="margin:0;padding:0;background:${colors.background};font-family:${fontStack};color:${colors.heading};-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">Your Nexdo verification code expires in ${e(expiresIn)}.${'&#847;&zwnj;&nbsp;'.repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${colors.background}"><tr><td align="center" style="padding:12px 0;">
<!--[if mso]><table role="presentation" width="680"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#FFFFFF" style="max-width:680px;margin:0 auto;">
<tr><td style="padding:26px 24px 8px;background:#F2F7FF;background-image:linear-gradient(120deg,#FFFFFF,#EEF6FF,#F6EEFF);">
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td>${img('nexdo-logo-official', 190)}</td></tr></table>
<p style="margin:8px 0 22px;font-size:12px;line-height:18px;color:${colors.muted};">Less on your mind, more done in your day.</p>
<div style="font-size:0;">
<div style="display:inline-block;width:50%;min-width:260px;vertical-align:middle;">
<h1 style="margin:0 0 14px;font-size:36px;line-height:42px;letter-spacing:-1px;">Welcome to <span style="color:#7037FF;">NexDo!</span></h1>
<p style="margin:0 0 22px;font-size:19px;line-height:27px;color:${colors.muted};">Your personal AI-powered productivity assistant is almost ready.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${highlights.map(([asset, copy]) => `<td width="25%" align="center" valign="top" style="padding:0 4px;font-size:11px;line-height:16px;">${img(asset + '-recreated', 34)}<p style="margin:8px 0 16px;">${copy}</p></td>`).join('')}</tr></table>
</div><div style="display:inline-block;width:50%;min-width:260px;vertical-align:middle;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="50%" valign="bottom">${img('ai-robot-recreated', 160, 'Your friendly NexDo AI assistant')}</td><td width="50%">${img('phone-mockup-recreated', 160, 'Tasks, calendar, shopping and moments in NexDo')}</td></tr></table>
</div></div></td></tr>
<tr><td style="padding:18px 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#F1F4FF" style="border-radius:20px;"><tr><td style="padding:22px 18px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="68" valign="top" style="padding-right:12px;">${img('verification-envelope-recreated', 68)}</td><td><h2 style="margin:0 0 7px;font-size:24px;line-height:30px;">Verify your email</h2><p style="margin:0 0 16px;font-size:15px;line-height:23px;color:${colors.muted};">Use this code to finish creating your NexDo account.</p></td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#E6EAFF" style="padding:14px 6px;border-radius:12px;">
<div style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:32px;line-height:40px;font-weight:700;letter-spacing:6px;padding-left:6px;">${e(code)}</div>
<div style="font-size:13px;line-height:20px;color:${colors.muted};padding-top:4px;">Expires in ${e(expiresIn)} &middot; single use</div>
</td></tr></table></td></tr></table></td></tr>
<tr><td align="center" style="padding:4px 20px 12px;">
<h2 style="margin:8px 0;font-size:25px;line-height:32px;">Top 10 Ways <span style="color:#8B3EFF;">NexDo Makes Life Easier</span></h2>
<p style="margin:0 0 12px;font-size:15px;line-height:23px;color:${colors.muted};">More than a to-do app — your AI assistant for everyday life.</p>
<div style="font-size:0;text-align:center;">${cards}</div>
</td></tr>
<tr><td align="center" style="padding:8px 24px 24px;">
<table role="presentation" align="center" cellpadding="0" cellspacing="0"><tr><td align="center" bgcolor="#6235FF" style="border-radius:32px;background-image:linear-gradient(90deg,#009DFF,#6235FF,#EB31F3);"><a href="${appStore}" style="display:inline-block;padding:18px 38px;border-radius:32px;font-size:21px;line-height:27px;font-weight:700;color:#FFFFFF;text-decoration:none;">Open NexDo App &rarr;</a></td></tr></table>
<p style="margin:12px 0 0;font-size:12px;line-height:18px;color:${colors.muted};">This will open the NexDo app page on the App Store.</p>
</td></tr>
<tr><td style="padding:24px;background:#F1F5FF;font-size:12px;line-height:19px;color:${colors.muted};">
<div style="display:inline-block;vertical-align:middle;margin:0 20px 12px 0;">${img('nexdo-logo-official', 160)}<p style="margin:8px 0;">Less on your mind, more done in your day.</p></div>
<div style="display:inline-block;vertical-align:middle;margin-bottom:12px;"><a href="${appStore}">${img('app-store-badge-official', 150, 'Download on the App Store')}</a></div>
<p style="margin:8px 0;">You're receiving this because someone signed up for NexDo with this email address. If you didn't request this, you can ignore this email.</p>
<p style="margin:8px 0 0;">Questions? <a href="mailto:${e(support)}" style="color:#285FE5;">${e(support)}</a></p>
</td></tr></table><!--[if mso]></td></tr></table><![endif]-->
</td></tr></table></body></html>`;
  const text = [
    'Welcome to NexDo!', 'Less on your mind, more done in your day.',
    'Your personal AI-powered productivity assistant is almost ready.',
    'Verify your email', 'Use this code to finish creating your NexDo account.',
    `Your code is ${code}.\nExpires in ${expiresIn} · single use`,
    'Top 10 Ways NexDo Makes Life Easier',
    ...features.map(([, title, copy], i) => `${i + 1}. ${title}: ${copy}`),
    `Open NexDo App (App Store): ${appStore}`,
    "If you didn't request this email, you can ignore it.", `Questions? ${support}`,
  ].join('\n\n') + '\n';
  return { html, text };
}
