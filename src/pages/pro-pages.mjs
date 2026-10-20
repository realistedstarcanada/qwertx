// QWERTx Pro: checkout test page (hidden until launch) and the post-checkout welcome page.
import fs from 'node:fs';
import path from 'node:path';
import { esc } from '../lib/format.mjs';
import { pageHero } from '../parts.mjs';

export function proPages(root) {
  let pro;
  try { pro = JSON.parse(fs.readFileSync(path.join(root, 'config/pro.json'), 'utf8')); } catch { return []; }
  const plans = Object.entries(pro.plans);
  const test = pro.mode !== 'live';

  const checkout = {
    page: 'pro', path: '/pro/checkout-test.html', noindex: true,
    title: 'Pro checkout (test)', description: 'Internal test page for QWERTx Pro checkout.',
    body: `${pageHero({ crumbs: [['Pro', '/pro.html'], ['Checkout test']], eyebrow: test ? 'Test mode · not public' : 'Checkout', h1: 'QWERTx Pro <span class="accent">checkout</span>', lead: test ? 'This page is for testing payments before launch. Use Stripe’s test card 4242 4242 4242 4242, any future expiry date and any 3-digit CVC. No real money moves.' : 'Choose a plan.' })}
<section class="section-sm"><div class="container"><div class="pro-plans">
${plans.map(([k, p]) => `<form class="card pro-plan" method="post" action="/api/checkout?plan=${esc(k)}">
  <div class="card-label"><span>${esc(p.label)}</span>${k === 'yearly' ? '<span>Best value</span>' : ''}</div>
  <h3>${esc(p.price)}</h3>
  ${k === 'yearly' && pro.promoCode ? `<p class="form-note">Founding members: enter code <b>${esc(pro.promoCode)}</b> at checkout.</p>` : '<p class="form-note">Cancel anytime.</p>'}
  <button class="btn btn-primary" type="submit">Continue to secure checkout</button>
</form>`).join('')}
</div>
<p class="form-note" style="margin-top:14px">Payments are processed by Stripe. QWERTx never sees or stores card numbers.</p>
</div></section>`,
  };

  const welcome = {
    page: 'pro', path: '/pro/welcome.html', noindex: true,
    title: 'Welcome to QWERTx Pro', description: 'Your QWERTx Pro membership is active.',
    body: `${pageHero({ crumbs: [['Pro', '/pro.html'], ['Welcome']], eyebrow: 'QWERTx Pro', h1: 'Welcome to <span class="accent">Pro</span>', lead: 'Checking your payment…' })}
<section class="section-sm"><div class="container"><div class="card" id="pro-welcome"><p class="form-note">One moment.</p></div></div></section>
<script>
(function () {
  var id = new URLSearchParams(location.search).get('session_id');
  var box = document.getElementById('pro-welcome'), lead = document.querySelector('.page-hero .lead');
  if (!id) { lead.textContent = 'No checkout found.'; return; }
  fetch('/api/checkout-status?session_id=' + encodeURIComponent(id)).then(function (r) { return r.json(); }).then(function (s) {
    if (!s.ok) { lead.textContent = 'We could not confirm this checkout yet.'; box.innerHTML = '<p>If you were charged, email support and we will sort it out right away.</p>'; return; }
    lead.textContent = 'Thank you' + (s.email ? ', ' + s.email : '') + '. Your membership is active.' + (s.test ? ' (test mode)' : '');
    box.innerHTML = '<h3>What happens next</h3><ul class="rank-list"><li><span class="t">We will email you a sign-in link to set up your watchlist.</span></li><li><span class="t">Alerts start the day you add your first stock.</span></li><li><span class="t">Manage or cancel any time from your account page.</span></li></ul>';
  }).catch(function () { lead.textContent = 'We could not confirm this checkout yet.'; });
})();
</script>`,
  };
  return [checkout, welcome];
}
