// Plain-English "what this page tells you / how to read it" guides for people new to investing.
// Each is { what, items: [[term, explanation], ...] } and renders under the page header (parts.mjs guide()).

export const GUIDES = {
  investors: {
    what: 'The stock portfolios of famous professional investors, taken from the official reports they must file with the SEC every quarter.',
    items: [
      ['What a 13F is', 'Every US fund managing over $100 million must list its US-listed stock holdings four times a year, within 45 days after each quarter ends. That is where these portfolios come from.'],
      ['What it leaves out', 'Cash, bonds, short bets, private companies and most non-US shares are not in a 13F. A portfolio here is the US-stock part of what they own.'],
      ['Top 10 and “behaves like”', 'How concentrated a portfolio is. A top 10 of 90% or “behaves like 8 bets” means a few big ideas; a low share means many small ones.'],
      ['It is a few weeks old', 'Because filings arrive up to 45 days after the quarter, treat these as a look at what great investors were doing, not a live signal.'],
    ],
  },
  investor: (name) => ({
    what: `What ${name} owns, what changed last quarter, and how concentrated the bets are, from the latest SEC 13F filing.`,
    items: [
      ['% of portfolio', 'How much of the reported portfolio sits in each stock. Larger numbers mean stronger conviction.'],
      ['New, Added, Trimmed, Sold', 'Changes since the previous quarter: a new position, more shares, fewer shares, or no shares left.'],
      ['Value', 'The stake’s worth at the quarter-end price, not today’s price.'],
      ['Copying with care', 'You see moves weeks after they happened, and not why they were made. Use them for ideas, then do your own research.'],
    ],
  }),
  smart: {
    what: 'The stocks the fund managers we track own most, and the ones they bought or sold most last quarter.',
    items: [
      ['Owners', 'How many of the tracked fund managers hold the stock. Many owners with different styles is often called a “consensus” pick.'],
      ['Buyers vs. sellers', 'Who opened or added to a position versus who trimmed or sold out in the latest quarter.'],
      ['Popular is not safe', 'A stock many professionals own can still fall. Popularity tells you where the attention is, not what happens next.'],
      ['Timing', 'Holdings come from quarterly 13F filings, up to 45 days after each quarter ends.'],
    ],
  },
  stock: (label) => ({
    what: `Who owns ${label}: well-known fund managers, members of Congress and the company’s own executives, all from official filings.`,
    items: [
      ['Fund managers', 'From their quarterly 13F filings. “% of portfolio” shows how big a bet it is for each of them.'],
      ['Politicians', 'Trades by members of Congress, disclosed within 45 days and reported as dollar ranges.'],
      ['Insiders', 'Executives and directors buying or selling their own company’s shares. Buying with their own money is rarer and more telling than selling.'],
      ['Not a recommendation', 'Ownership shows who is interested, not whether the stock will go up. Always do your own research.'],
    ],
  }),
  politicians: {
    what: 'Stock trades disclosed by members of the US Congress and by the President, from their official financial disclosure filings.',
    items: [
      ['The STOCK Act', 'Members of Congress must report their trades within 45 days. The President reports through the Office of Government Ethics.'],
      ['Amount ranges', 'Disclosures give a range such as $1,001–$15,000, never an exact amount.'],
      ['Traded vs. disclosed', 'The trade date is when it happened; the disclosure date is when the public found out, often weeks later.'],
      ['Why people watch', 'Lawmakers may know about upcoming rules and contracts. A trade here is public information, not evidence of wrongdoing.'],
    ],
  },
  insiders: {
    what: 'Company executives and directors buying and selling shares of their own company, from SEC Form 4 filings.',
    items: [
      ['Form 4', 'Insiders must report a trade within two business days, so this is some of the freshest official data there is.'],
      ['Buying is the signal', 'Insiders sell for many ordinary reasons (taxes, a house, planned sales). They usually buy for one: they think the shares are cheap.'],
      ['Clusters', 'When several insiders at the same company buy within a few weeks, it is rarer and more meaningful than one purchase.'],
      ['Open-market only', 'We show trades made on the open market, not option exercises or shares granted as pay.'],
    ],
  },
  market: {
    what: 'How fearful or greedy investors feel right now, with the gauges professionals watch, in plain English.',
    items: [
      ['Fear & Greed', 'CNN’s 0–100 index combining seven market signals. Low numbers mean fear, high numbers mean greed.'],
      ['VIX', 'The “fear gauge”: how much the market expects stocks to swing over the next month. Higher means more nervous.'],
      ['Extremes', 'Very fearful markets have often been better times to buy than very greedy ones, but they can stay extreme for a while.'],
      ['Not a timing tool', 'Mood changes daily. Long-term investors use it to stay calm, not to jump in and out.'],
    ],
  },
  calendar: {
    what: 'When companies report their results and when the big economic numbers come out, so nothing surprises you.',
    items: [
      ['Earnings', 'Each quarter, companies report sales and profit. EPS is profit per share; the estimate is what analysts expect.'],
      ['Before the open / after the close', 'Most reports come before US markets open (BMO) or after they close (AMC). The stock often moves sharply the next session.'],
      ['Economic events', 'Data such as inflation (CPI), jobs and interest-rate decisions can move the whole market.'],
      ['Times', 'Shown in Eastern Time, the time zone of the New York and Toronto stock exchanges.'],
    ],
  },
};
