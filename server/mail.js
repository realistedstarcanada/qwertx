// Emails for QWERTx Pro, sent with Resend (RESEND_API_KEY, MAIL_FROM = "QWERTx <alerts@your-domain>").
// Every alert or digest carries a manage link and a one-click unsubscribe (CASL / Gmail bulk-sender rules).
import { esc } from './util.js';
import { describe, fmtDate } from './alerts.js';

const DISCLAIMER = 'QWERTx provides information from public filings for education. It is not investment advice or a recommendation to buy or sell any security.';

export const mailReady = (env) => !!(env.RESEND_API_KEY && env.MAIL_FROM);

export async function sendMail(env, msg) {
  if (!mailReady(env)) {
    if (env.DEV_MAIL_LOG) console.log('[mail]', msg.to, msg.subject, '\n' + msg.text);
    return { ok: !!env.DEV_MAIL_LOG, dev: true };
  }
  const res = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload(env, msg)) });
  return { ok: res.ok, status: res.status };
}

/** Up to 100 messages per call. Returns how many were accepted. */
export async function sendBatch(env, msgs) {
  let sent = 0;
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    if (!mailReady(env)) {
      for (const m of chunk) if (env.DEV_MAIL_LOG) console.log('[mail]', m.to, m.subject, '\n' + m.text);
      sent += env.DEV_MAIL_LOG ? chunk.length : 0;
      continue;
    }
    const res = await fetch('https://api.resend.com/emails/batch', { method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(chunk.map((m) => payload(env, m))) });
    if (res.ok) sent += chunk.length;
  }
  return sent;
}

function payload(env, m) {
  const p = { from: env.MAIL_FROM, to: [m.to], subject: m.subject, html: m.html, text: m.text };
  if (env.MAIL_REPLY_TO) p.reply_to = env.MAIL_REPLY_TO;
  if (m.unsubscribe) p.headers = { 'List-Unsubscribe': `<${m.unsubscribe}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' };
  return p;
}

// ---------- Layout ----------

function frame(env, { preheader = '', body, footer = '' }) {
  const address = env.MAIL_POSTAL_ADDRESS || 'Ottawa, Ontario, Canada';
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;background:#F4F1EA;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#1B2233">
<span style="display:none!important;opacity:0;color:transparent;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F1EA"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#FFFFFF;border:1px solid #E3DFD4;border-radius:12px">
<tr><td style="background:#0B0F1A;border-radius:12px 12px 0 0;padding:18px 24px"><span style="font-family:Georgia,serif;font-size:22px;color:#F1F3F8;letter-spacing:.5px">QWERT<span style="color:#F5B83D">x</span></span><span style="float:right;font-size:12px;color:#8A93A8;padding-top:7px">After Work Investment Strategies</span></td></tr>
<tr><td style="padding:24px">${body}</td></tr>
<tr><td style="padding:0 24px 24px;font-size:12px;line-height:1.5;color:#5B6478">${footer}<p style="margin:12px 0 0">${DISCLAIMER}</p><p style="margin:8px 0 0">QWERTx · ${esc(address)}</p></td></tr>
</table></td></tr></table></body></html>`;
}

const button = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#F5B83D;color:#0B0F1A;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:9px">${esc(label)}</a>`;

const prefsFooter = (site, user) =>
  `<p style="margin:0">You get this email because you watch these stocks on QWERTx. <a href="${site}/account.html#alerts" style="color:#B9781A">Manage alerts</a> · <a href="${site}/api/unsubscribe?u=${encodeURIComponent(user.unsub_token)}" style="color:#B9781A">Unsubscribe</a></p>`;

// ---------- Messages ----------

export function loginEmail(env, { to, link }) {
  const site = new URL(link).origin;
  return {
    to,
    subject: 'Your QWERTx sign-in link',
    text: `Sign in to QWERTx:\n${link}\n\nThe link works once and expires in 30 minutes. If you didn't ask for it, ignore this email.`,
    html: frame(env, {
      preheader: 'Your sign-in link (expires in 30 minutes)',
      body: `<h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 12px">Sign in to QWERTx</h1>
<p style="margin:0 0 20px;line-height:1.6">Use this button to sign in and see who owns the stocks you own. It works once and expires in 30 minutes.</p>
<p style="margin:0 0 20px">${button(link, 'Sign in to QWERTx')}</p>
<p style="margin:0;font-size:13px;color:#5B6478">If you didn't ask for this, you can ignore it. Nobody can sign in without this link. Visit ${esc(site)} any time.</p>`,
    }),
  };
}

export function welcomeProEmail(env, { to, link, founding }) {
  return {
    to,
    subject: founding ? 'Welcome, founding member: your QWERTx Pro is active' : 'Your QWERTx Pro membership is active',
    text: `Thanks for joining QWERTx Pro${founding ? ' as a founding member' : ''}.\n\nSet up your watchlist (add up to 50 stocks):\n${link}\n\nAlerts start as soon as you add your first stock.`,
    html: frame(env, {
      preheader: 'Add your stocks and see who owns what you own',
      body: `<h1 style="font-family:Georgia,serif;font-weight:500;font-size:24px;margin:0 0 12px">Welcome to QWERTx Pro${founding ? ', founding member' : ''}</h1>
<p style="margin:0 0 16px;line-height:1.6">Add the stocks you own and you'll immediately see which tracked fund managers hold them, who just bought or sold, and where politicians and insiders have been active.</p>
<p style="margin:0 0 20px">${button(link, 'Set up my watchlist')}</p>
<p style="margin:0;font-size:13px;color:#5B6478">This link signs you in once and expires in 30 minutes. After that, sign in any time from the Account page with your email.</p>`,
    }),
  };
}

function eventRows(events, managers, site) {
  return events
    .map((e) => {
      const d = describe(e, managers);
      const color = d.tone === 'up' ? '#0F8F7E' : d.tone === 'down' ? '#C73E3E' : '#5B6478';
      return `<tr><td style="padding:12px 0;border-top:1px solid #E3DFD4">
<div style="font-size:12px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:.04em">${esc(d.tag)} · <a href="${site}/stocks/${esc(e.t.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}.html" style="color:#1B2233">${esc(e.t)}</a></div>
<div style="font-size:15px;line-height:1.5;margin-top:4px">${esc(d.text)}</div>
<div style="font-size:12.5px;color:#5B6478;margin-top:4px">${esc(d.detail)}${d.source ? ` <a href="${esc(d.source)}" style="color:#B9781A">Official filing</a>` : ''}</div></td></tr>`;
    })
    .join('');
}

const eventText = (events, managers) => events.map((e) => { const d = describe(e, managers); return `• ${d.tag} · ${e.t}: ${d.text}\n  ${d.detail}${d.source ? `\n  ${d.source}` : ''}`; }).join('\n\n');

/** Instant or daily alert email. */
export function alertEmail(env, { site, user, events, managers, daily }) {
  const tickers = [...new Set(events.map((e) => e.t))];
  const subject = daily
    ? `Your stocks today: ${events.length} new disclosure${events.length > 1 ? 's' : ''} (${tickers.slice(0, 4).join(', ')}${tickers.length > 4 ? '…' : ''})`
    : events.length === 1 ? `${events[0].t}: ${describe(events[0], managers).tag.toLowerCase()} disclosed` : `${events.length} new disclosures on ${tickers.slice(0, 4).join(', ')}${tickers.length > 4 ? '…' : ''}`;
  const unsubscribe = `${site}/api/unsubscribe?u=${encodeURIComponent(user.unsub_token)}`;
  return {
    to: user.email,
    subject,
    unsubscribe,
    text: `${daily ? 'Your daily QWERTx alert summary' : 'New disclosures on your watchlist'}\n\n${eventText(events, managers)}\n\nSee your watchlist: ${site}/account.html\nManage alerts: ${site}/account.html#alerts\nUnsubscribe: ${unsubscribe}\n\n${DISCLAIMER}`,
    html: frame(env, {
      preheader: describe(events[0], managers).text,
      body: `<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 6px">${daily ? 'Today on your watchlist' : 'New on your watchlist'}</h1>
<p style="margin:0 0 8px;color:#5B6478;font-size:14px">Filing dates are shown on every line, so you always know how fresh the information is.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventRows(events, managers, site)}</table>
<p style="margin:20px 0 0">${button(`${site}/account.html`, 'Open my watchlist')}</p>`,
      footer: prefsFooter(site, user),
    }),
  };
}

/**
 * Friday digest. snapshot = [{ t, name, owners, bought, trimmed, exited, earnings }] for the member's stocks.
 * Sent even when nothing happened, so a quiet week still tells them where things stand.
 */
const briefTeaser = (body) => String(body || '').split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p && !p.startsWith('## '))[0] || '';

export function weeklyEmail(env, { site, user, events, managers, snapshot, pro, limit, brief }) {
  const managersTotal = new Set(snapshot.flatMap((s) => s.holders || [])).size;
  const quiet = events.length === 0;
  const unsubscribe = `${site}/api/unsubscribe?u=${encodeURIComponent(user.unsub_token)}`;
  const lines = snapshot
    .map((s) => {
      const bits = s.owners ? [`${s.owners} tracked manager${s.owners > 1 ? 's' : ''} own it`] : ['No tracked manager owns it'];
      if (pro) {
        if (s.bought) bits.push(`${s.bought} bought`);
        if (s.trimmed) bits.push(`${s.trimmed} trimmed`);
        if (s.exited) bits.push(`${s.exited} sold out`);
      }
      if (s.earnings) bits.push(`earnings ${s.earnings}`);
      return { t: s.t, name: s.name, text: bits.join(' · ') };
    });
  const subject = quiet ? `Your stocks this week: a quiet week (${snapshot.length} watched)` : `Your stocks this week: ${events.length} new disclosure${events.length > 1 ? 's' : ''}`;
  const upsell = pro ? '' : `<tr><td style="padding:16px;background:#FFF7E6;border:1px solid #F1D9A6;border-radius:10px">
<b>${managersTotal} smart-money investor${managersTotal === 1 ? '' : 's'} own your stocks.</b> Pro shows who bought, trimmed or sold out, sends alerts the day a filing lands and watches up to 50 stocks.
<div style="margin-top:12px">${button(`${site}/pro.html`, 'See QWERTx Pro')}</div></td></tr>`;
  return {
    to: user.email,
    subject,
    unsubscribe,
    text: `Your QWERTx week\n\n${brief ? `THE QWERTx BRIEF: ${brief.title}\n${briefTeaser(brief.body)}\n${pro ? `Read it: ${site}/account.html#brief` : `Pro members get the full Brief: ${site}/pro.html`}\n\n` : ''}${quiet ? 'No new filings touched your stocks this week. Here is where they stand:' : eventText(events, managers)}\n\n${lines.map((l) => `${l.t} (${l.name}): ${l.text}`).join('\n')}\n\n${pro ? '' : `${managersTotal} smart-money investors own your stocks. QWERTx Pro: ${site}/pro.html\n\n`}See your watchlist: ${site}/account.html\nUnsubscribe: ${unsubscribe}\n\n${DISCLAIMER}`,
    html: frame(env, {
      preheader: quiet ? 'A quiet week. Here is where your stocks stand.' : `${events.length} new disclosures on your stocks`,
      body: `${brief ? `<div style="border:1px solid #F1D9A6;background:#FFF7E6;border-radius:10px;padding:16px;margin-bottom:22px"><div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#B9781A;font-weight:600">The QWERTx Brief</div><div style="font-family:Georgia,serif;font-size:20px;margin:6px 0">${esc(brief.title)}</div><p style="margin:0 0 12px;line-height:1.6">${esc(briefTeaser(brief.body))}</p>${button(pro ? `${site}/account.html#brief` : `${site}/pro.html`, pro ? 'Read the full Brief' : 'Get the full Brief with Pro')}</div>` : ''}<h1 style="font-family:Georgia,serif;font-weight:500;font-size:22px;margin:0 0 6px">Your stocks this week</h1>
<p style="margin:0 0 12px;color:#5B6478;font-size:14px">${quiet ? 'No new filings touched your stocks this week. That’s normal: fund managers file once a quarter. Here is where things stand.' : `${events.length} new disclosure${events.length > 1 ? 's' : ''} touched your stocks this week.`}</p>
${quiet ? '' : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${eventRows(pro ? events : events.slice(0, 3), managers, site)}</table>${!pro && events.length > 3 ? `<p style="font-size:13px;color:#5B6478">+ ${events.length - 3} more with Pro.</p>` : ''}`}
<h2 style="font-size:15px;margin:22px 0 6px">Where your ${snapshot.length} stock${snapshot.length > 1 ? 's' : ''} stand${snapshot.length > 1 ? '' : 's'}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lines.map((l) => `<tr><td style="padding:8px 0;border-top:1px solid #E3DFD4;font-size:14px"><b>${esc(l.t)}</b> <span style="color:#5B6478">${esc(l.name)}</span><div style="font-size:13px;margin-top:2px">${esc(l.text)}</div></td></tr>`).join('')}</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:18px">${upsell}</table>
<p style="margin:20px 0 0">${button(`${site}/account.html`, 'Open my watchlist')}</p>`,
      footer: prefsFooter(site, user),
    }),
  };
}

export { fmtDate };
