// GET /api/pro-status — public: is checkout open, and how many founding seats are left.
import pro from '../../config/pro.json';
import { foundingSeatsLeft } from './checkout.js';
import { json, route } from '../../server/util.js';

export const onRequestGet = route(async ({ env }) => {
  const seats = pro.plans.founding?.seats || 0;
  const left = await foundingSeatsLeft(env).catch(() => seats);
  return new Response(JSON.stringify({ checkoutOpen: !!pro.checkoutOpen, testMode: pro.mode !== 'live', founding: { seats, left } }), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' },
  });
});
