// What the account page needs about the signed-in member, in one object.
import { isPro, limitFor, prefsOf } from './pro.js';

export async function accountView(DB, user) {
  const { results = [] } = await DB.prepare(`SELECT ticker, input, added_at FROM watchlist WHERE user_id = ? ORDER BY added_at, ticker`).bind(user.id).all();
  const limit = limitFor(user);
  return {
    signedIn: true,
    email: user.email,
    pro: isPro(user),
    status: user.sub_status || null,
    plan: user.sub_plan || null,
    periodEnd: user.period_end || null,
    cancelAtPeriodEnd: !!user.cancel_at_period_end,
    founding: !!user.founding,
    hasBilling: !!user.stripe_customer,
    limit,
    prefs: prefsOf(user),
    // Stocks beyond the plan's limit (after a Pro plan ends) are kept but paused, oldest first stay active.
    watchlist: results.map((r, i) => ({ ticker: r.ticker, input: r.input, addedAt: r.added_at, active: i < limit })),
  };
}
