// Temporary: shown before Google's consent screen while Google is still verifying the OAuth app.
// Remove with the GOOGLE_OAUTH_UNVERIFIED_NOTICE variable once verification is approved
// (docs/google-oauth-verification.md).

export function oauthNoticeEnabled() {
  return process.env.GOOGLE_OAUTH_UNVERIFIED_NOTICE === 'true';
}

function escapeHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const STYLE = `
:root{color-scheme:light dark;--bg:#f6f7f9;--card:#fff;--text:#14171c;--muted:#565e6b;--line:#dde1e7;--brand:#1f5eff;--on-brand:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#0f1115;--card:#181b21;--text:#eef0f3;--muted:#a3abb8;--line:#2b303a;--brand:#6f97ff;--on-brand:#0f1115}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:17px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
main{max-width:480px;margin:0 auto;padding:32px 16px}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:24px 20px}
h1{font-size:24px;line-height:1.25;margin:0 0 12px}
p,ol{margin:0 0 16px}
ol{padding-left:24px}
li{margin-bottom:8px}
.note{color:var(--muted);font-size:15px}
.primary{display:block;min-height:48px;padding:12px 16px;border-radius:12px;background:var(--brand);color:var(--on-brand);font-weight:600;text-align:center;text-decoration:none}
.secondary{display:block;min-height:48px;padding:12px 16px;margin-top:8px;color:var(--brand);text-align:center;text-decoration:none}
`;

/**
 * The notice page. `continueUrl` and `cancelUrl` are built by the caller from known values only.
 * Every interpolated value is HTML-escaped. No JavaScript: it must work in any in-app browser.
 */
export function oauthNoticeResponse(options: { service: 'Google Calendar' | 'Gmail'; continueUrl: string; cancelUrl: string }) {
  const service = escapeHtml(options.service);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>One extra step from Google</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<div class="card">
<h1>One extra step from Google</h1>
<p>${escapeHtml(`Google is still finishing its review of Nexdo. Until that is done, Google shows a screen that says "Google hasn't verified this app" before you can connect your `)}${service}.</p>
<p>To continue:</p>
<ol>
<li>${escapeHtml('Tap "Advanced".')}</li>
<li>${escapeHtml('Tap "Go to Nexdo (unsafe)".')}</li>
<li>Review the permissions and tap Continue.</li>
</ol>
<p class="note">${escapeHtml("Note: Nexdo only gets the permissions listed on Google's permission screen. You can disconnect at any time in Nexdo's settings.")}</p>
<a class="primary" href="${escapeHtml(options.continueUrl)}">Continue to Google</a>
<a class="secondary" href="${escapeHtml(options.cancelUrl)}">Cancel</a>
</div>
</main>
</body>
</html>`;
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
      'X-Robots-Tag': 'noindex',
      // The page has no scripts or external resources; only its inline <style> may load.
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    },
  });
}
