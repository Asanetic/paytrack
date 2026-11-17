// The Owners Report wording. Each sentence is the original report's text with the figures,
// names and dates replaced by values computed from the data (see api/paytrack/smartreport).
// Edit the wording here; nothing else in the report needs to change.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

// currency label comes from the data (set at the start of buildReport); KES is shown as "KSh"
let CUR = "KSh";
const curLabel = (c) => { const u = String(c || "KES").toUpperCase(); return u === "KES" ? "KSh" : u; };
export const ksh = (v) => `${CUR} ${Number(v || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const kshShort = (v) => `${CUR} ${Number(v || 0).toLocaleString("en-KE", { maximumFractionDigits: 2 })}`; // 184,300 (no .00)
const word = (k) => WORDS[k] ?? String(k);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const list = (a) => (a.length <= 1 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);

const dparts = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return { y, m: m - 1, d }; };
export function periodLabel(start, end) {
  const a = dparts(start), b = dparts(end);
  if (a.y === b.y && a.m === b.m) return a.d === b.d ? `${a.d} ${MONTHS[a.m]} ${a.y}` : `${a.d}–${b.d} ${MONTHS[a.m]} ${a.y}`;
  return `${a.d} ${MONTHS[a.m]} ${a.y} – ${b.d} ${MONTHS[b.m]} ${b.y}`;
}
const dayRange = (first, last) => {
  const a = dparts(first), b = dparts(last);
  const one = (x) => `${x.d} ${MONTHS[x.m]}`;
  return first && last && String(first).slice(0, 10) !== String(last).slice(0, 10) ? `${a.d}–${one(b)}` : one(a);
};

// how each payment mode is named in the report
const MODES = {
  mpesa: { name: "M-PESA", where: "M-PESA", fee: "M-PESA transaction charges", statement: "M-PESA Business statement", short: "M-PESA", adj: "M-PESA" },
  card: { name: "Bank cards", where: "Bank cards", fee: "Card processing charges", statement: "Card payment statement", short: "cards", adj: "card" },
  cash: { name: "Cash", where: "Cash", fee: "Cash handling charges", statement: "Cash records", short: "cash", adj: "cash" },
  bank: { name: "Bank transfers", where: "Bank transfers", fee: "Bank charges", statement: "Bank statement", short: "bank transfers", adj: "bank transfer" },
};
const mode = (m) => MODES[m] || { name: cap(m), where: cap(m), fee: `${cap(m)} charges`, statement: `${cap(m)} statement`, short: m, adj: m };

function times(a, b) {
  const r = b > 0 ? a / b : 0;
  if (r < 1.25) return "about the same as";
  if (r < 1.75) return "about one and a half times";
  if (r < 2.5) return "about twice";
  return `about ${word(Math.round(r))} times`;
}

/** data = API result, opts = { business: "hotel", demo: false, notes: "" } -> everything the pages render */
export function buildReport(data, opts = {}) {
  CUR = curLabel(data.currency);
  const biz = (opts.business || "business").trim() || "business";
  const BIZ = biz.toUpperCase();
  const demo = !!opts.demo;
  const merchant = `${data.merchant}${demo ? " (sample)" : ""}`;
  const period = periodLabel(data.period.start, data.period.end);

  const ins = [...data.in].sort((a, b) => b.total - a.total);
  const totalIn = ins.reduce((s, r) => s + r.total, 0);
  const countIn = ins.reduce((s, r) => s + r.n, 0);
  const outs = [...data.out].sort((a, b) => b.total - a.total);
  const totalOut = outs.reduce((s, r) => s + r.total, 0);
  const countOut = outs.reduce((s, r) => s + r.n, 0);

  // charges per mode: fees on money in + fees on money out
  const feeMap = {};
  data.in.forEach((r) => { feeMap[r.mode] = (feeMap[r.mode] || 0) + r.fees; });
  data.out.forEach((r) => { feeMap[r.mode] = (feeMap[r.mode] || 0) + r.fees; });
  // list charges in the same order as the money-in table (biggest channel first)
  const feeOrder = [...ins.map((r) => r.mode), ...data.out.map((r) => r.mode)];
  const fees = Object.entries(feeMap).filter(([, v]) => v > 0)
    .sort((a, b) => feeOrder.indexOf(a[0]) - feeOrder.indexOf(b[0]))
    .map(([m, v]) => ({ label: mode(m).fee, amount: v }));
  const totalFees = fees.reduce((s, f) => s + f.amount, 0);
  const diff = totalIn - totalOut - totalFees;

  // statements used = every mode that has records
  const modeKeys = [...new Set([...data.in.map((r) => r.mode), ...data.out.map((r) => r.mode)])];
  const statements = modeKeys.map((m) => {
    const inN = data.in.filter((r) => r.mode === m).reduce((s, r) => s + r.n, 0);
    const outN = data.out.filter((r) => r.mode === m).reduce((s, r) => s + r.n, 0);
    const shows = m === "card" ? "Customer card payments and card processing fees"
      : `${cap([inN && "money received", outN && "money paid out"].filter(Boolean).join(", "))} and ${mode(m).short} fees`;
    return { name: mode(m).statement, count: inN + outN, shows };
  }).sort((a, b) => b.count - a.count);

  const outSource = outs.length ? mode([...data.out].sort((a, b) => b.total - a.total)[0].mode).short : "payment";
  const inLabels = ins.map((r) => mode(r.mode).short);
  const nChannels = ins.length;
  const nStatements = statements.length;

  const outside = data.outside || [];
  const outsideN = outside.reduce((s, r) => s + r.n, 0);
  const outsideTotal = outside.reduce((s, r) => s + r.total, 0);
  const outsideFees = outside.reduce((s, r) => s + r.fees, 0);
  const outsideMode = outside.length ? mode(outside.sort((a, b) => b.n - a.n)[0].mode).short : "";
  const outsideDates = outside.length ? dayRange(outside.map((r) => r.first_date).sort()[0], outside.map((r) => r.last_date).sort().slice(-1)[0]) : "";

  const top = ins[0], second = ins[1];
  const card = data.in.find((r) => r.mode === "card");
  const cardCheckOk = card && data.card_mismatches === 0;

  const pages = {};

  // ---------- page 1 ----------
  pages.biz = biz;
  pages.title = `YOUR ${BIZ} MONEY REPORT`;
  pages.subtitle = `${merchant} | ${period}`;
  pages.intro = `A plain-English look at the money that came in, the money that went out, and the charges paid to receive or move it. You do not need to be an accountant to read this report.`;
  pages.cards = [
    { label: "MONEY RECEIVED", value: ksh(totalIn) },
    { label: "MONEY PAID OUT", value: ksh(totalOut) },
    { label: "FEES CHARGED", value: ksh(totalFees) },
    { label: "CALCULATED DIFFERENCE", value: ksh(diff) },
  ];
  pages.shortVersion = [
    `Customers paid the ${biz} ${ksh(totalIn)} through the ${nChannels === 1 ? "one channel" : `${word(nChannels)} channels`} we were given: ${list(inLabels)}. ` +
      (totalOut ? `The ${outSource} account also made payments of ${ksh(totalOut)}. ` : "") +
      `The ${nStatements === 1 ? "statement shows" : `${word(nStatements)} statements show`} ${ksh(totalFees)} in transaction charges.`,
    `After subtracting the ${outSource} payments and the recorded fees from the recorded customer collections, the calculated difference is ${ksh(diff)}.`,
  ];
  pages.important = `Important: this difference is not the ${biz}'s profit and is not proof that this amount is sitting in the bank. It is simply the result of the transactions in the ${nStatements === 1 ? "statement" : "statements"} we were given.`;
  pages.looked = { headers: ["Statement", "Transactions used", "What it shows"], rows: statements.map((s) => [s.name, s.count, s.shows]) };
  pages.periodNote = `This report uses activity dated ${period}.` +
    (outsideN ? ` ${cap(word(outsideN))} ${outsideMode} ${outsideN === 1 ? "entry" : "entries"} dated ${outsideDates} ${outsideN === 1 ? "was" : "were"} left out and listed separately because they fall outside this period.` : "");

  // ---------- 1. money in ----------
  pages.moneyIn = {
    headers: ["Where customers paid", "Number of payments", "Total received"],
    rows: ins.map((r) => [mode(r.mode).where, r.n, ksh(r.total)]),
    total: ["TOTAL", countIn, ksh(totalIn)],
  };
  const descs = (data.descriptions?.[top?.mode] || []).map((d) => d.toLowerCase());
  pages.tells = [];
  if (top && second) {
    pages.tells.push(`${cap(mode(top.mode).short)} brought in about ${ksh(top.total)}, which was ${times(top.total, second.total)} the ${mode(second.mode).adj} payments of ${ksh(second.total)}. ${demo ? "In this sample" : "In this period"}, ${mode(top.mode).short} was the bigger way customers paid the ${biz}.`);
  } else if (top) {
    pages.tells.push(`All of the recorded money came in through ${mode(top.mode).short}, ${ksh(top.total)} in total.`);
  }
  if (descs.length) {
    pages.tells.push(`The ${mode(top.mode).statement.replace(" Business", "")} describes payments for ${list(descs)}. These labels come from the ${demo ? "sample " : ""}statement; they have not been checked against the ${biz}'s booking or till system.`);
  }
  const origin = (data.card_origin || []).map((r) => ({ label: /dom/i.test(r.origin) ? "Kenyan / domestic cards" : /int/i.test(r.origin) ? "International cards" : `${r.origin} cards`, n: r.n, total: r.total }));
  pages.card = origin.length ? {
    headers: ["Card type", "Number of payments", "Amount paid"],
    rows: origin.map((o) => [o.label, o.n, ksh(o.total)]),
    total: ["TOTAL", origin.reduce((s, o) => s + o.n, 0), ksh(origin.reduce((s, o) => s + o.total, 0))],
  } : null;
  // revenue streams: only shown when the money-in rows carry a category (e.g. Rooms, Pharmacy, Hair, Groceries)
  const cats = (data.in_category || []).filter((c) => c.category).sort((a, b) => b.total - a.total);
  pages.sources = cats.length ? {
    headers: ["Where the money came from", "Number of payments", "Total received"],
    rows: cats.map((c) => [c.category, c.n, ksh(c.total)]),
    total: ["TOTAL", cats.reduce((s, c) => s + c.n, 0), ksh(cats.reduce((s, c) => s + c.total, 0))],
  } : null;
  pages.chartSources = cats.map((c) => ({ label: c.category, value: c.total }));
  pages.simple = top && second ? `In simple terms: the ${biz} received more money through ${mode(top.mode).short} than through ${mode(second.mode).short} during the period covered by these ${demo ? "sample " : ""}records.` : "";

  // ---------- 2. money out ----------
  const byCat = {};
  data.out.forEach((r) => { byCat[r.category] = byCat[r.category] || { n: 0, total: 0 }; byCat[r.category].n += r.n; byCat[r.category].total += r.total; });
  pages.outIntro = `The ${outSource} statement shows payments made by the ${biz}. These are payments recorded in that ${outSource} account, not every expense the ${biz} may have paid from other accounts.`;
  pages.moneyOut = {
    headers: ["Type of payment", "Number of payments", "Amount paid"],
    rows: Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, v.n, ksh(v.total)]),
    total: ["TOTAL", countOut, ksh(totalOut)],
  };
  // built from the payment types actually found in the data, not from a fixed list
  const catNames = Object.keys(byCat).filter((c) => c !== "Other payments").map((c) => c.toLowerCase());
  pages.whoReceived = [
    (catNames.length ? `The payment types recorded are ${list(catNames)}. ` : "") +
    (catNames.some((c) => /mobile|phone/.test(c)) ? `A payment to a mobile number is not automatically a salary or supplier payment. ` : "") +
    `The ${biz} should confirm who received each payment and why.`,
  ];

  // ---------- 3. charges ----------
  pages.charges = {
    headers: ["Charge", "Amount"],
    rows: fees.map((f) => [f.label, ksh(f.amount)]),
    total: ["TOTAL CHARGES SHOWN", ksh(totalFees)],
  };
  pages.chargesNote = [
    `These are charges shown in the ${nStatements === 1 ? "" : `${word(nStatements)} `}${demo ? "sample " : ""}${nStatements === 1 ? "statement" : "statements"}. They are the cost of receiving or moving money through those services. They do not include any other bank fees or costs that were not in the files we received.`,
    `A useful question for management: can some of these charges be reduced by reviewing payment methods, provider rates or how payments are handled? We would need real provider statements and more periods before recommending a change.`,
  ];

  // ---------- 4. how much is left ----------
  pages.left = [
    `If we take the recorded customer payments of ${ksh(totalIn)}, subtract the ${outSource} payments of ${ksh(totalOut)}, and subtract the charges of ${ksh(totalFees)}, the answer is ${ksh(diff)}.`,
    `Think of this as a simple adding-and-subtracting exercise using the ${nStatements === 1 ? "statement" : "statements"}. It is not the same as profit, and it is not the same as checking the money in all the ${biz}'s bank accounts.`,
  ];
  const bal = data.balances?.mpesa || Object.values(data.balances || {})[0];
  const balMode = data.balances?.mpesa ? "M-PESA" : Object.keys(data.balances || {})[0] ? mode(Object.keys(data.balances)[0]).short : "";
  pages.account = bal ? {
    title: `The ${balMode} account itself`,
    text: `The ${demo ? "sample " : ""}${balMode} ledger shows a balance of ${ksh(bal.balance)} at the end of ${dayRange(bal.date, bal.date)}. That is the balance shown for this ${balMode} account only. It does not include the ${biz}'s other accounts.`,
  } : null;

  // ---------- 5. needs checking ----------
  pages.checks = [];
  if (outsideN) {
    pages.checks.push([`${cap(word(outsideN))} ${outsideMode} ${outsideN === 1 ? "entry" : "entries"} dated ${outsideDates}`,
      `${outsideN === 1 ? "It is" : "They are"} outside the ${period.replace(/ \d{4}$/, "")} report period, so we left ${outsideN === 1 ? "it" : "them"} out. ${outsideN === 1 ? "It totals" : "They total"} ${kshShort(outsideTotal)}${outsideFees ? ` plus ${kshShort(outsideFees)} in fees` : ""}.`]);
  }
  if (data.card_mismatches > 0) {
    pages.checks.push([`${data.card_mismatches} card payment${data.card_mismatches === 1 ? "" : "s"} where the fee does not match`, `The fee shown does not equal the amount paid minus the amount settled. See the exceptions list to review ${data.card_mismatches === 1 ? "it" : "them"}.`]);
  }
  pages.checks.push(
    ["What each payment was for", "Some payment descriptions do not identify the exact supplier, staff member or reason."],
  );
  if (card) pages.checks.push(["Card payments reaching the bank", "The card statement shows what was collected and the fees, but we need the bank statement to confirm when the money arrived in the bank."]);
  pages.checks.push(["Sales and booking records", `We need the ${biz}'s sales, booking or till records to confirm that payments match actual customer bills.`]);
  pages.couldCheck = card
    ? (cardCheckOk
      ? `The card statement adds up correctly: card payments less card charges equal the card settlement amount. These are checks of the figures in the statements, not an independent audit of the ${biz}.`
      : `${data.card_mismatches} card payment${data.card_mismatches === 1 ? "" : "s"} do not add up (the fee does not equal the amount paid minus the amount settled). These are checks of the figures in the statements, not an independent audit of the ${biz}.`)
    : `These are checks of the figures in the statements, not an independent audit of the ${biz}.`;

  // ---------- 6. recommendations ----------
  pages.recommend = [
    `The sales, booking or till report. This helps confirm which customer bill or sale each payment belongs to.`,
    `The bank statement. This helps confirm that ${card ? "card " : ""}payments were actually received in the bank account.`,
    `A supplier list or invoice report. This helps identify who the ${biz} paid and what the payment was for.`,
    `The next month's statements. This helps show whether sales, spending and payment charges are going up or down.`,
  ];
  pages.definitions = [
    ["Money received", "Payments customers made to the " + biz + "."],
    ["Money paid out", `Payments the ${biz} made from the ${outSource} account shown.`],
    ["Transaction charges", "Fees charged for receiving or moving money."],
    ["Calculated difference", "Money received minus the payments and charges shown. Not profit."],
    ["Needs checking", `A payment or detail that needs the ${biz} to explain or confirm it.`],
  ];
  pages.pleaseNote = demo
    ? `This is a demonstration report made from fictional sample statements for ${data.merchant}. The ${biz} name, account details, transactions, amounts and fees are invented. The report covers only the records supplied to PAYTRACK and does not claim to show every shilling that moved through the ${biz}.`
    : `This report was prepared from the statements and records supplied to PAYTRACK for ${data.merchant}. It covers only those records and does not claim to show every shilling that moved through the ${biz}.`;
  pages.tagline = "PAYTRACK -- Every shilling in. Every shilling out. Accounted for.";
  pages.footer = `PAYTRACK • ${data.merchant.toUpperCase()}${demo ? " • FICTIONAL DEMONSTRATION" : ""}`;
  // chart data (optional charts; same figures as the tables)
  pages.chartIn = ins.map((r) => ({ label: mode(r.mode).where, value: r.total }));
  pages.chartOut = Object.entries(byCat).sort((a, b) => b[1].total - a[1].total).map(([k, v]) => ({ label: k, value: v.total }));
  pages.chartLeft = [
    { label: "Money received", value: totalIn },
    { label: "Money paid out", value: totalOut },
    { label: "Charges", value: totalFees },
    { label: "Calculated difference", value: diff, strong: true },
  ];
  pages.notes = (opts.notes || "").trim();
  pages.hasOut = countOut > 0;
  pages.hasData = countIn + countOut > 0;
  return pages;
}
