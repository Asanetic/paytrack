import { connectDB, activeDB } from "../../../apiUtils/dataControl/conn";
import { magicRandomStr } from "../../../apiUtils/dataControl/dataUtils";

const T = (t) => `\`${activeDB}\`.\`${t}\``;
const MAX_ROWS = 20000;
const CHUNK = 500;

/* ---------- channel rates (same rule as gatewayipn) ---------- */

const RATE_COL = { cash: "transaction_rate_cash", card: "transaction_rate_card", mpesa: "transaction_rate_mpesa" };
const hasVal = (v) => v !== null && v !== undefined && v !== "" && !isNaN(v);
const round2 = (n) => Math.round(n * 100) / 100;

// mode-specific channel rate -> channel default -> 0
function resolveRate(channel, mode) {
  const specific = channel?.[RATE_COL[mode]];
  if (hasVal(specific)) return Number(specific);
  if (hasVal(channel?.default_transaction_rate)) return Number(channel.default_transaction_rate);
  return 0;
}

/* ---------- parsing / validation ---------- */

// "Fee %" -> fee_pct, "Gross (KES)" -> gross_kes, "Txn Date" -> txn_date
const norm = (k) => String(k || "").trim().toLowerCase().replace(/%/g, "_pct").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v) => {
  const s = str(v).replace(/[,\s%]/g, "");
  return s !== "" && !isNaN(s) ? Number(s) : null;
};
// first non-blank value among a column's accepted header names (template names + acquirer statement names)
const pick = (r, ...keys) => { for (const k of keys) if (str(r[k]) !== "") return r[k]; return ""; };
const INFO_FLAGS = ["unverified", "amount_derived"]; // shown in preview, never raised as exceptions

function parseDate(v) {
  const m = str(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  if (dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function cleanRow(raw, line, defaultChannel = "") {
  const r = {};
  for (const k in raw) r[norm(k)] = raw[k];

  const dirRaw = str(r.type || r.transaction_type).toLowerCase().replace(/[\s-]+/g, "_");
  let direction = dirRaw === "" || ["in", "money_in", "received"].includes(dirRaw) ? "in"
    : ["out", "money_out", "paid", "paid_out"].includes(dirRaw) ? "out" : null;

  // Each field accepts our template header and the acquirer-statement header.
  const gross = pick(r, "amount", "gross", "gross_kes", "gross_amount", "paid_in");
  const withdrawn = pick(r, "withdrawn", "paid_out", "withdrawal"); // M-PESA style statements: separate Paid in / Withdrawn columns
  const ratePct = pick(r, "rate", "fee_pct", "fee_percent", "fee_rate", "rate_pct");
  const fee = pick(r, "charges", "fee", "fee_kes", "fee_amount");
  const net = pick(r, "settled_amount", "net", "net_kes", "net_amount", "settled");
  const card = str(pick(r, "card_scheme", "card", "card_type"));
  const opt = (v) => (str(v) === "" ? null : num(v));

  const settleRaw = str(pick(r, "settlement_date", "settled_on"));
  const extra = Object.fromEntries(Object.entries({
    settlement_date: settleRaw ? (parseDate(settleRaw)?.slice(0, 10) || settleRaw) : "",
    card_scheme: card,
    origin: str(r.origin),
    description: str(r.description),
    batch: str(r.batch),
    category: str(pick(r, "category", "payment_category")), // money out: Supplier payments, Paybill payments...
    balance: num(pick(r, "balance", "running_balance")) ?? "", // running balance shown on the statement
  }).filter(([, v]) => v !== ""));

  const row = {
    line,
    direction,
    transaction_id: str(pick(r, "transaction_id", "txn_id", "transaction_ref")),
    transaction_at: parseDate(pick(r, "transaction_date", "txn_date", "date", "transaction_at")),
    branch: str(pick(r, "channel", "branch")) || str(defaultChannel), // "branch" header still accepted
    payment_mode: str(pick(r, "payment_mode", "mode")).toLowerCase() || (card ? "card" : ""),
    amount: opt(gross),
    currency: (str(r.currency) || "KES").toUpperCase(),
    payer_name: str(pick(r, "payer_name", "payer", "guest_name")),
    payer_phone: str(r.payer_phone),
    reference: str(pick(r, "reference", "guest_ref", "ref")),
    expected_amount: opt(r.expected_amount),
    in_rate: opt(ratePct),     // optional, from sheet (%)
    in_charges: opt(fee),      // optional, actual fee amount
    in_settled: opt(net),      // optional, net paid out to the merchant
    extra,
    status: (str(r.status) || "completed").toLowerCase(),
    errors: [],
    flags: [],
  };

  // Paid in / Withdrawn layout: a row with only a Withdrawn value is money out.
  if (dirRaw === "" && row.amount === null && str(gross) === "" && str(withdrawn) !== "") {
    row.direction = "out";
    row.amount = opt(withdrawn);
  }
  // Fees on money out can't be stored as rate/charges columns, so they travel with the event (the Owners Report sums them).
  if (row.direction === "out" && row.in_charges !== null) row.extra.charges = row.in_charges;

  // Gap-filling: a statement row can be missing the gross. Rebuild it from the other figures.
  if (row.amount === null && str(gross) === "") {
    let a = null;
    if (row.in_charges !== null && row.in_settled !== null) a = row.in_charges + row.in_settled;
    else if (row.in_charges !== null && row.in_rate) a = (row.in_charges * 100) / row.in_rate;
    else if (row.in_settled !== null && row.in_rate !== null && row.in_rate < 100) a = row.in_settled / (1 - row.in_rate / 100);
    if (a !== null) { row.amount = round2(a); row.flags.push("amount_derived"); }
  }

  if (!row.direction) row.errors.push("type must be money_in or money_out");
  if (!row.transaction_id) row.errors.push("transaction_id is required");
  if (!row.transaction_at) row.errors.push("transaction_date missing or invalid (use YYYY-MM-DD HH:MM:SS)");
  if (!row.branch) row.errors.push("channel is required (add the column, or pick a channel for the file)");
  if (!row.payment_mode) row.errors.push("payment_mode is required");
  if (row.amount === null) row.errors.push(str(gross) === "" ? "amount is missing and cannot be worked out from the fee / net" : "amount must be a number");
  else if (row.amount < 0) row.errors.push("amount cannot be negative");
  if (str(r.expected_amount) !== "" && row.expected_amount === null) row.errors.push("expected_amount must be a number");
  if (str(ratePct) !== "" && (row.in_rate === null || row.in_rate < 0 || row.in_rate > 100)) row.errors.push("rate must be a percentage between 0 and 100");
  if (str(fee) !== "" && (row.in_charges === null || row.in_charges < 0)) row.errors.push("charges must be a number, 0 or more");
  else if (row.in_charges !== null && row.amount !== null && row.in_charges > row.amount) row.errors.push("charges cannot be more than the amount");
  if (str(net) !== "" && (row.in_settled === null || row.in_settled < 0 || (row.amount !== null && row.in_settled > row.amount))) {
    row.errors.push("settled_amount must be a number between 0 and the amount");
  }
  return row;
}

/** Classify rows: error | duplicate | valid, attach analysis flags. */
async function classify(conn, rawRows, hive, defaultChannel = "") {
  if (!Array.isArray(rawRows) || !rawRows.length) throw new Error("No rows found in file");
  if (rawRows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS} per upload)`);

  const rows = rawRows.map((r, i) => cleanRow(r, i + 2, defaultChannel)); // +2 = excel line number

  // existing transaction ids in DB
  const existing = new Set();
  for (const [dir, table, col] of [["in", "payment_transactions", "transaction_id"], ["out", "business_events", "event_id"]]) {
    const ids = [...new Set(rows.filter((r) => r.direction === dir && r.transaction_id).map((r) => r.transaction_id))];
    for (let i = 0; i < ids.length; i += 1000) {
      const [found] = await conn.query(
        `SELECT \`${col}\` AS id FROM ${T(table)} WHERE hive_site_id <=> ? AND \`${col}\` IN (?)`,
        [hive.id, ids.slice(i, i + 1000)]
      );
      found.forEach((f) => existing.add(`${dir}|${f.id}`));
    }
  }

  const [chs] = await conn.query(
    `SELECT branch_name, transaction_rate_cash, transaction_rate_card, transaction_rate_mpesa, default_transaction_rate FROM ${T("branches")} WHERE hive_site_id <=> ?`,
    [hive.id]
  );
  const channels = new Map(chs.map((c) => [String(c.branch_name).toLowerCase(), c]));

  const seenId = new Set();
  const seenRef = new Set();
  for (const r of rows) {
    if (r.errors.length) { r.state = "error"; continue; }
    const idKey = `${r.direction}|${r.transaction_id}`;
    if (existing.has(idKey) || seenId.has(idKey)) {
      r.state = "duplicate";
      r.errors.push(existing.has(idKey) ? "already imported" : "repeated transaction_id in file");
      continue;
    }
    seenId.add(idKey);
    r.state = "valid";

    if (r.direction === "in") {
      // amount = what the client paid; settled (net) = what the merchant actually received.
      // Net settlement is the source of truth, then charges, then rate, then the channel rate.
      // Whatever is missing is computed; if the figures disagree the row is flagged
      // "charge_mismatch" and the stored values follow the most reliable one.
      const eff = (c) => (r.amount > 0 ? Math.round((c / r.amount) * 1e6) / 1e4 : 0);
      const rateCharge = r.in_rate !== null ? round2(r.amount * (r.in_rate / 100)) : null;
      if (r.in_settled !== null) {
        r.charge = round2(r.amount - r.in_settled);
        r.rate = eff(r.charge);
        const stated = r.in_charges !== null ? round2(r.in_charges) : rateCharge;
        r.rate_source = stated === null ? "sheet (from settled amount)" : "sheet";
        if (stated !== null && Math.abs(stated - r.charge) >= 1) r.mismatch = { expected: stated, actual: r.charge };
      } else if (r.in_charges !== null) {
        r.charge = round2(r.in_charges);
        r.rate = r.in_rate !== null ? r.in_rate : eff(r.charge);
        r.rate_source = r.in_rate !== null ? "sheet" : "sheet (rate from charges)";
        if (rateCharge !== null && Math.abs(rateCharge - r.charge) >= 1) {
          r.mismatch = { expected: rateCharge, actual: r.charge };
          r.rate = eff(r.charge);
        }
      } else if (r.in_rate !== null) {
        r.rate = r.in_rate;
        r.charge = round2(r.amount * (r.rate / 100));
        r.rate_source = "sheet (charges from rate)";
      } else {
        r.rate = resolveRate(channels.get(r.branch.toLowerCase()), r.payment_mode);
        r.charge = round2(r.amount * (r.rate / 100));
        r.rate_source = "channel";
      }
      r.disbursed = round2(r.amount - r.charge);
      if (r.mismatch) r.flags.push("charge_mismatch");
    }

    // ignore rounding noise: only flag a real difference (1 currency unit or more)
    if (r.expected_amount !== null && Math.abs(r.amount - r.expected_amount) >= 1) {
      r.flags.push(r.amount < r.expected_amount ? "underpaid" : "overpaid");
    }
    if (r.reference) {
      const key = `${r.direction}|${r.branch.toLowerCase()}|${r.reference.toLowerCase()}|${r.amount}`;
      if (seenRef.has(key)) r.flags.push("possible_duplicate");
      seenRef.add(key);
    } else if (r.expected_amount === null) {
      r.flags.push("unverified");
    }
  }
  return rows;
}

/* ---------- analysis ---------- */

function analyse(rows) {
  const valid = rows.filter((r) => r.state === "valid");
  const group = (fn) => {
    const m = {};
    valid.forEach((r) => {
      const k = fn(r);
      m[k] = m[k] || { key: k, count: 0, in: 0, out: 0, total: 0 };
      m[k].count++;
      m[k][r.direction] += r.amount;
      m[k].total = m[k].in - m[k].out;
    });
    return Object.values(m).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  };
  const sum = (dir) => valid.filter((r) => r.direction === dir).reduce((s, r) => s + r.amount, 0);
  const money_in = sum("in"), money_out = sum("out");
  const flagCount = (f) => valid.filter((r) => r.flags.includes(f)).length;

  return {
    total_rows: rows.length,
    valid: valid.length,
    errors: rows.filter((r) => r.state === "error").length,
    duplicates: rows.filter((r) => r.state === "duplicate").length,
    money_in,
    money_out,
    total_charges: valid.reduce((t, r) => t + (r.charge || 0), 0),
    total_disbursed: valid.reduce((t, r) => t + (r.disbursed || 0), 0),
    net: money_in - money_out,
    count_in: valid.filter((r) => r.direction === "in").length,
    count_out: valid.filter((r) => r.direction === "out").length,
    underpaid: flagCount("underpaid"),
    overpaid: flagCount("overpaid"),
    possible_duplicates: flagCount("possible_duplicate"),
    charge_mismatches: flagCount("charge_mismatch"),
    amount_derived: flagCount("amount_derived"),
    unverified: flagCount("unverified"),
    by_branch: group((r) => r.branch),
    by_mode: group((r) => r.payment_mode),
    by_day: group((r) => r.transaction_at.slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

const slim = (r) => ({
  line: r.line, direction: r.direction, transaction_id: r.transaction_id, transaction_at: r.transaction_at, branch: r.branch,
  payment_mode: r.payment_mode, amount: r.amount, payer_name: r.payer_name, reference: r.reference,
  expected_amount: r.expected_amount, rate: r.rate ?? null, rate_source: r.rate_source ?? null, charge: r.charge ?? null, disbursed: r.disbursed ?? null, state: r.state, flags: r.flags, errors: r.errors,
});

/* ---------- public API ---------- */

/** Channels with their configured rates (for the channel picker and the template's Channels sheet). */
export async function listChannels(authData) {
  const conn = await connectDB();
  try {
    const [rows] = await conn.query(
      `SELECT branch_name AS name, transaction_rate_cash AS cash, transaction_rate_card AS card,
              transaction_rate_mpesa AS mpesa, default_transaction_rate AS \`default\`
       FROM ${T("branches")} WHERE hive_site_id <=> ? ORDER BY branch_name`,
      [authData.hive_site_id ?? null]
    );
    return { channels: rows };
  } finally {
    await conn.end();
  }
}

export async function previewTransactions(rawRows, authData, defaultChannel = "") {
  const conn = await connectDB();
  try {
    const hive = { id: authData.hive_site_id ?? null, name: authData.hive_site_name ?? null };
    const rows = await classify(conn, rawRows, hive, defaultChannel);
    const newBranches = new Set();
    const [bs] = await conn.query(`SELECT branch_name FROM ${T("branches")} WHERE hive_site_id <=> ?`, [hive.id]);
    const have = new Set(bs.map((b) => b.branch_name.toLowerCase()));
    rows.filter((r) => r.state === "valid" && !have.has(r.branch.toLowerCase())).forEach((r) => newBranches.add(r.branch.toLowerCase()));
    return { summary: { ...analyse(rows), new_branches: newBranches.size }, rows: rows.map(slim) };
  } finally {
    await conn.end();
  }
}

export async function commitTransactions(rawRows, authData, fileName = "upload.xlsx", defaultChannel = "") {
  const conn = await connectDB();
  const hive = { id: authData.hive_site_id ?? null, name: authData.hive_site_name ?? null };
  const uploader = authData.user_id || authData.record_id || authData.email || null;
  const startedAt = new Date();
  const base = { hive_site_id: hive.id, hive_site_name: hive.name };

  const bulk = async (table, cols, list) => {
    for (let i = 0; i < list.length; i += CHUNK) {
      await conn.query(`INSERT INTO ${T(table)} (${cols.map((c) => `\`${c}\``).join(",")}) VALUES ?`, [
        list.slice(i, i + CHUNK).map((o) => cols.map((c) => o[c] ?? null)),
      ]);
    }
  };

  try {
    await conn.beginTransaction();
    const rows = await classify(conn, rawRows, hive, defaultChannel);
    const valid = rows.filter((r) => r.state === "valid");
    const validIn = valid.filter((r) => r.direction === "in");
    const importId = magicRandomStr(12);

    /* branches */
    const [bs] = await conn.query(`SELECT record_id, branch_name FROM ${T("branches")} WHERE hive_site_id <=> ?`, [hive.id]);
    const branchMap = new Map(bs.map((b) => [b.branch_name.toLowerCase(), b.record_id]));
    const newBranches = [];
    valid.forEach((r) => {
      const k = r.branch.toLowerCase();
      if (!branchMap.has(k)) {
        const id = magicRandomStr(12);
        branchMap.set(k, id);
        newBranches.push({ record_id: id, branch_code: `BR${String(bs.length + newBranches.length + 1).padStart(3, "0")}`, branch_name: r.branch, status: "active", ...base });
      }
    });
    await bulk("branches", ["record_id", "branch_code", "branch_name", "status", "hive_site_id", "hive_site_name"], newBranches);

    /* payment sources (one per mode) */
    const [ps] = await conn.query(`SELECT record_id, code FROM ${T("payment_sources")} WHERE hive_site_id <=> ?`, [hive.id]);
    const sourceMap = new Map(ps.map((s) => [String(s.code).toLowerCase(), s.record_id]));
    const newSources = [];
    valid.forEach((r) => {
      if (!sourceMap.has(r.payment_mode)) {
        const id = magicRandomStr(12);
        sourceMap.set(r.payment_mode, id);
        newSources.push({ record_id: id, name: r.payment_mode.toUpperCase(), code: r.payment_mode, type: r.payment_mode, status: "active", ...base });
      }
    });
    await bulk("payment_sources", ["record_id", "name", "code", "type", "status", "hive_site_id", "hive_site_name"], newSources);

    /* clients (match by phone, else name) */
    const [cs] = await conn.query(`SELECT client_name, phone FROM ${T("clients")} WHERE hive_site_id <=> ?`, [hive.id]);
    const clientKeys = new Set();
    cs.forEach((c) => { if (c.phone) clientKeys.add(`p:${c.phone}`); clientKeys.add(`n:${String(c.client_name).toLowerCase()}`); });
    const newClients = [];
    validIn.forEach((r) => {
      if (!r.payer_name && !r.payer_phone) return;
      const keys = [r.payer_phone && `p:${r.payer_phone}`, r.payer_name && `n:${r.payer_name.toLowerCase()}`].filter(Boolean);
      const known = r.payer_phone ? clientKeys.has(`p:${r.payer_phone}`) : clientKeys.has(`n:${r.payer_name.toLowerCase()}`);
      if (known) return;
      keys.forEach((k) => clientKeys.add(k));
      newClients.push({
        record_id: magicRandomStr(12),
        client_code: `CL${String(cs.length + newClients.length + 1).padStart(4, "0")}`,
        client_name: r.payer_name || r.payer_phone, phone: r.payer_phone || null, ...base,
      });
    });
    await bulk("clients", ["record_id", "client_code", "client_name", "phone", "hive_site_id", "hive_site_name"], newClients);

    /* transactions + exceptions */
    const txs = [];
    const events = [];
    const exceptions = [];
    valid.forEach((r) => {
      const rid = magicRandomStr(12);
      const branch_id = branchMap.get(r.branch.toLowerCase());
      const isOut = r.direction === "out";
      const meta = JSON.stringify({ import_id: importId, expected_amount: r.expected_amount, ...r.extra, ...(isOut ? { payee_name: r.payer_name, payee_phone: r.payer_phone } : {}) });
      if (isOut) {
        events.push({
          record_id: rid, branch_id, event_id: r.transaction_id, event_type: "Money Out", external_ref: r.reference || null,
          amount: r.amount, currency: r.currency, payment_mode: r.payment_mode, occurred_at: r.transaction_at,
          status: r.status, metadata: meta, ...base,
        });
      } else txs.push({
        record_id: rid, branch_id, payment_source_id: sourceMap.get(r.payment_mode), transaction_id: r.transaction_id,
        external_ref: r.reference || null, amount: r.amount, currency: r.currency, payer_name: r.payer_name || null,
        payer_phone: r.payer_phone || null, payment_mode: r.payment_mode, transaction_at: r.transaction_at,
        status: r.status, metadata: meta, rate: r.rate, rate_amount: r.charge, disbursed: r.disbursed, ...base,
      });
      r.flags.filter((f) => !INFO_FLAGS.includes(f)).forEach((f) => {
        const isFee = f === "charge_mismatch";
        const expected = isFee ? r.mismatch.expected : r.expected_amount ?? 0;
        const actual = isFee ? r.mismatch.actual : r.amount;
        const diff = f === "possible_duplicate" ? 0 : isFee ? round2(actual - expected) : r.amount - r.expected_amount;
        exceptions.push({
          record_id: magicRandomStr(12), branch_id, ...(isOut ? { event_id: rid } : { payment_transaction_id: rid }), exception_type: f,
          severity: f === "possible_duplicate" ? "high" : "medium",
          title: { underpaid: "Underpaid transaction", overpaid: "Overpaid transaction", possible_duplicate: "Possible duplicate payment", charge_mismatch: "Fee does not match settlement" }[f],
          description: `${isOut ? "OUT " : ""}${r.transaction_id} (${r.branch}) ref ${r.reference || "-"}`,
          expected_amount: expected, actual_amount: actual, difference_amount: diff, status: "open", ...base,
        });
      });
    });
    await bulk("payment_transactions", ["record_id", "branch_id", "payment_source_id", "transaction_id", "external_ref", "amount", "currency", "payer_name", "payer_phone", "payment_mode", "transaction_at", "status", "metadata", "rate", "rate_amount", "disbursed", "hive_site_id", "hive_site_name"], txs);
    await bulk("business_events", ["record_id", "branch_id", "event_id", "event_type", "external_ref", "amount", "currency", "payment_mode", "occurred_at", "status", "metadata", "hive_site_id", "hive_site_name"], events);
    await bulk("exceptions", ["record_id", "branch_id", "event_id", "payment_transaction_id", "exception_type", "severity", "title", "description", "expected_amount", "actual_amount", "difference_amount", "status", "hive_site_id", "hive_site_name"], exceptions);

    const summary = { ...analyse(rows), new_branches: newBranches.length, new_clients: newClients.length, exceptions: exceptions.length };

    await bulk("imports", ["record_id", "file_name", "file_type", "total_rows", "successful_rows", "failed_rows", "duplicate_rows", "status", "error_log", "uploaded_by", "started_at", "completed_at", "hive_site_id", "hive_site_name"], [{
      record_id: importId, file_name: fileName, file_type: "transactions", total_rows: summary.total_rows,
      successful_rows: summary.valid, failed_rows: summary.errors, duplicate_rows: summary.duplicates, status: "completed",
      // row errors for reference + ids of everything this import created (used by undo)
      error_log: JSON.stringify({
        errors: rows.filter((r) => r.state === "error").slice(0, 200).map((r) => ({ line: r.line, errors: r.errors })),
        created: { branches: newBranches.map((b) => b.record_id), sources: newSources.map((x) => x.record_id), clients: newClients.map((c) => c.record_id) },
      }),
      uploaded_by: uploader, started_at: startedAt, completed_at: new Date(), ...base,
    }]);

    await conn.commit();
    return { import_id: importId, summary, exceptions: exceptions.map((e) => ({ type: e.exception_type, title: e.title, description: e.description, expected: e.expected_amount, actual: e.actual_amount, difference: e.difference_amount })) };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}

/** Fill rate / charges / disbursed on already-imported transactions that have no rate. */
export async function backfillRates(authData) {
  const conn = await connectDB();
  try {
    const col = (c) => `CAST(NULLIF(b.${c}, '') AS DECIMAL(10,4))`;
    const [res] = await conn.query(
      `UPDATE ${T("payment_transactions")} t
       JOIN (
         SELECT p.record_id, COALESCE(
             CASE LOWER(p.payment_mode)
               WHEN 'cash' THEN ${col("transaction_rate_cash")}
               WHEN 'card' THEN ${col("transaction_rate_card")}
               WHEN 'mpesa' THEN ${col("transaction_rate_mpesa")}
             END,
             ${col("default_transaction_rate")}, 0) AS rate
         FROM ${T("payment_transactions")} p
         LEFT JOIN ${T("branches")} b ON b.record_id = p.branch_id
         WHERE p.hive_site_id <=> ? AND (p.rate IS NULL OR p.rate = '')
       ) x ON x.record_id = t.record_id
       SET t.rate = x.rate,
           t.rate_amount = ROUND(t.amount * x.rate / 100, 2),
           t.disbursed = ROUND(t.amount - ROUND(t.amount * x.rate / 100, 2), 2)`,
      [authData.hive_site_id ?? null]
    );
    return { updated: res.affectedRows };
  } finally {
    await conn.end();
  }
}

/* ---------- import history + undo ---------- */

export async function listImports(authData) {
  const conn = await connectDB();
  try {
    const [rows] = await conn.query(
      `SELECT record_id, file_name, total_rows, successful_rows, failed_rows, duplicate_rows, status, completed_at
       FROM ${T("imports")} WHERE hive_site_id <=> ? AND file_type = 'transactions'
       ORDER BY primkey DESC LIMIT 10`,
      [authData.hive_site_id ?? null]
    );
    return { imports: rows };
  } finally {
    await conn.end();
  }
}

/** Remove everything a single import created, in one transaction. */
export async function undoImport(importId, authData) {
  if (!/^[A-Za-z0-9]+$/.test(String(importId || ""))) throw new Error("Invalid import id");
  const hive = authData.hive_site_id ?? null;
  const conn = await connectDB();
  const inList = async (sql, ids) => (ids.length ? (await conn.query(sql, [hive, ids]))[0] : []);
  const chunked = async (sql, ids) => {
    let n = 0;
    for (let i = 0; i < ids.length; i += 1000) n += (await conn.query(sql, [hive, ids.slice(i, i + 1000)]))[0].affectedRows;
    return n;
  };

  try {
    await conn.beginTransaction();

    const [found] = await conn.query(
      `SELECT record_id, status, error_log FROM ${T("imports")} WHERE record_id = ? AND hive_site_id <=> ? FOR UPDATE`,
      [importId, hive]
    );
    const imp = found[0];
    if (!imp) throw new Error("Import not found");
    if (imp.status !== "completed") throw new Error(`This import is already ${imp.status}`);

    let created = {};
    try { created = JSON.parse(imp.error_log || "{}")?.created || {}; } catch { /* old-format log: nothing extra to remove */ }

    const like = `%"import_id":"${importId}"%`;
    const [txs] = await conn.query(`SELECT record_id FROM ${T("payment_transactions")} WHERE hive_site_id <=> ? AND metadata LIKE ?`, [hive, like]);
    const [evs] = await conn.query(`SELECT record_id FROM ${T("business_events")} WHERE hive_site_id <=> ? AND metadata LIKE ?`, [hive, like]);
    const txIds = txs.map((r) => r.record_id);
    const evIds = evs.map((r) => r.record_id);

    const exceptions =
      (await chunked(`DELETE FROM ${T("exceptions")} WHERE hive_site_id <=> ? AND payment_transaction_id IN (?)`, txIds)) +
      (await chunked(`DELETE FROM ${T("exceptions")} WHERE hive_site_id <=> ? AND event_id IN (?)`, evIds));
    await chunked(`DELETE FROM ${T("payment_transactions")} WHERE hive_site_id <=> ? AND record_id IN (?)`, txIds);
    await chunked(`DELETE FROM ${T("business_events")} WHERE hive_site_id <=> ? AND record_id IN (?)`, evIds);

    // Channels / payment sources / clients this import created are removed only if nothing else uses them.
    const cb = created.branches || [], cs = created.sources || [], cc = created.clients || [];
    const usedB = new Set([
      ...(await inList(`SELECT DISTINCT branch_id AS id FROM ${T("payment_transactions")} WHERE hive_site_id <=> ? AND branch_id IN (?)`, cb)),
      ...(await inList(`SELECT DISTINCT branch_id AS id FROM ${T("business_events")} WHERE hive_site_id <=> ? AND branch_id IN (?)`, cb)),
    ].map((r) => r.id));
    const usedS = new Set((await inList(`SELECT DISTINCT payment_source_id AS id FROM ${T("payment_transactions")} WHERE hive_site_id <=> ? AND payment_source_id IN (?)`, cs)).map((r) => r.id));
    const usedC = new Set((await inList(
      `SELECT c.record_id AS id FROM ${T("clients")} c WHERE c.hive_site_id <=> ? AND c.record_id IN (?) AND EXISTS (
         SELECT 1 FROM ${T("payment_transactions")} p WHERE p.hive_site_id <=> c.hive_site_id
           AND ((c.phone IS NOT NULL AND c.phone <> '' AND p.payer_phone = c.phone)
             OR ((c.phone IS NULL OR c.phone = '') AND p.payer_name = c.client_name)))`, cc)).map((r) => r.id));

    const removeUnused = async (table, ids, used) => {
      const del = ids.filter((id) => !used.has(id));
      await chunked(`DELETE FROM ${T(table)} WHERE hive_site_id <=> ? AND record_id IN (?)`, del);
      return del.length;
    };
    const removed = {
      channels: await removeUnused("branches", cb, usedB),
      sources: await removeUnused("payment_sources", cs, usedS),
      clients: await removeUnused("clients", cc, usedC),
    };

    await conn.query(`UPDATE ${T("imports")} SET status = 'undone' WHERE record_id = ? AND hive_site_id <=> ?`, [importId, hive]);
    await conn.commit();
    return { removed: { transactions: txIds.length, events: evIds.length, exceptions, ...removed } };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    await conn.end();
  }
}
