import { describe, expect, it } from 'vitest';
import { renderWishEmail } from './wish-template';

/** Wish emails go friend-to-friend from the user's Gmail, so they skip the account-email branding. */
describe('wish email template', () => {
  const input = { subject: 'Asha’s birthday', body: 'Happy birthday, Asha!\nHave a <great> year.\n\nSee you soon.', signature: 'Love, Sri', card: { src: 'cid:card-1@nexdo.local', alt: 'Greeting card', width: 520 } };

  it('renders the card, the wish, the signature and a small footer, with no logo or support line', () => {
    const html = renderWishEmail(input);
    expect(html).toContain('<img src="cid:card-1@nexdo.local" width="520" alt="Greeting card"');
    expect(html).toContain('Happy birthday, Asha!<br>Have a &lt;great&gt; year.</p>');
    expect(html).toContain('>See you soon.</p>');
    expect(html).toContain('>Love, Sri</p>');
    expect(html).toContain('>Sent with Nexdo</p>');
    expect(html).not.toContain('nexdo-logo-email');
    expect(html).not.toContain('Questions?');
    expect(html).not.toContain('<h1');
    expect(html.indexOf('cid:card-1')).toBeLessThan(html.indexOf('Happy birthday'));
    expect(html).toMatchSnapshot();
  });

  it('omits the card and signature when there are none', () => {
    const html = renderWishEmail({ subject: 'Hi', body: 'Thinking of you.', signature: '  ', card: null });
    expect(html).not.toContain('<img');
    expect(html).toContain('>Thinking of you.</p>');
    expect(html).toMatchSnapshot();
  });
});
