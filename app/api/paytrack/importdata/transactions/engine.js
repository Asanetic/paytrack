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

const norm = (k) => String(k || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v) => {
  const s = str(v).replace(/[,\s]/g, "");
  return s !== "" && !isNaN(s) ? Number(s) : null;
};

function parseDate(v) {
  const m = str(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +s);
  if (dt.getMonth() !== +mo - 1 || dt.getDate() !== +d) return null;
  return `${y}-${mo}-${d} ${h}:${mi}:${s}`;
}

function cleanRow(raw, line) {
  const r = {};
  for (const k in raw) r[norm(k)] = raw[k];

  const dirRaw = str(r.type || r.transaction_type).toLowerCase().replace(/[\s-]+/g, "_");
  const direction = dirRaw === "" || ["in", "money_in", "received"].includes(dirRaw) ? "in"
    : ["out", "money_out", "paid", "paid_out"].includes(dirRaw) ? "out" : null;

  const row = {
    line,
    direction,
    transaction_id: str(r.transaction_id),
    transaction_at: parseDate(r.transaction_date),
    branch: str(r.channel || r.branch), // sheet header is "channel"; "branch" still accepted
    payment_mode: str(r.payment_mode).toLowerCase(),
    amount: num(r.amount),
    currency: (str(r.currency) || "KES").toUpperCase(),
    payer_name: str(r.payer_name),
    payer_phone: str(r.payer_phone),
    reference: str(r.reference),
    expected_amount: str(r.expected_amount) === "" ? null : num(r.expected_amount),
    status: (str(r.status) || "completed").toLowerCase(),
    errors: [],
    flags: [],
  };

  if (!direction) row.errors.push("type must be money_in or money_out");
  if (!row.transaction_id) row.errors.push("transaction_id is required");
  if (!row.transaction_at) row.errors.push("transaction_date missing or invalid (use YYYY-MM-DD HH:MM:SS)");
  if (!row.branch) row.errors.push("channel is required");
  if (!row.payment_mode) row.errors.push("payment_mode is required");
  if (row.amount === null) row.errors.push("amount must be a number");
  else if (row.amount < 0) row.errors.push("amount cannot be negative");
  if (str(r.expected_amount) !== "" && row.expected_amount === null) row.errors.push("expected_amount must be a number");
  return row;
}

/** Classify rows: error | duplicate | valid, attach analysis flags. */
async function classify(conn, rawRows, hive) {
  if (!Array.isArray(rawRows) || !rawRows.length) throw new Error("No rows found in file");
  if (rawRows.length > MAX_ROWS) throw new Error(`Too many rows (max ${MAX_ROWS} per upload)`);

  const rows = rawRows.map((r, i) => cleanRow(r, i + 2)); // +2 = excel line number

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
      r.rate = resolveRate(channels.get(r.branch.toLowerCase()), r.payment_mode);
      r.charge = round2(r.amount * (r.rate / 100));
      r.disbursed = round2(r.amount - r.charge);
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
    unverified: flagCount("unverified"),
    by_branch: group((r) => r.branch),
    by_mode: group((r) => r.payment_mode),
    by_day: group((r) => r.transaction_at.slice(0, 10)).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

const slim = (r) => ({
  line: r.line, direction: r.direction, transaction_id: r.transaction_id, transaction_at: r.transaction_at, branch: r.branch,
  payment_mode: r.payment_mode, amount: r.amount, payer_name: r.payer_name, reference: r.reference,
  expected_amount: r.expected_amount, rate: r.rate ?? null, charge: r.charge ?? null, disbursed: r.disbursed ?? null, state: r.state, flags: r.flags, errors: r.errors,
});

/* ---------- public API ---------- */

export async function previewTransactions(rawRows, authData) {
  const conn = await connectDB();
  try {
    const hive = { id: authData.hive_site_id ?? null, name: authData.hive_site_name ?? null };
    const rows = await classify(conn, rawRows, hive);
    const newBranches = new Set();
    const [bs] = await conn.query(`SELECT branch_name FROM ${T("branches")} WHERE hive_site_id <=> ?`, [hive.id]);
    const have = new Set(bs.map((b) => b.branch_name.toLowerCase()));
    rows.filter((r) => r.state === "valid" && !have.has(r.branch.toLowerCase())).forEach((r) => newBranches.add(r.branch.toLowerCase()));
    return { summary: { ...analyse(rows), new_branches: newBranches.size }, rows: rows.map(slim) };
  } finally {
    await conn.end();
  }
}

export async function commitTransactions(rawRows, authData, fileName = "upload.xlsx") {
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
    const rows = await classify(conn, rawRows, hive);
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
      const meta = JSON.stringify({ import_id: importId, expected_amount: r.expected_amount, ...(isOut ? { payee_name: r.payer_name, payee_phone: r.payer_phone } : {}) });
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
      r.flags.filter((f) => f !== "unverified").forEach((f) => {
        const diff = f === "possible_duplicate" ? 0 : r.amount - r.expected_amount;
        exceptions.push({
          record_id: magicRandomStr(12), branch_id, ...(isOut ? { event_id: rid } : { payment_transaction_id: rid }), exception_type: f,
          severity: f === "possible_duplicate" ? "high" : "medium",
          title: { underpaid: "Underpaid transaction", overpaid: "Overpaid transaction", possible_duplicate: "Possible duplicate payment" }[f],
          description: `${isOut ? "OUT " : ""}${r.transaction_id} (${r.branch}) ref ${r.reference || "-"}`,
          expected_amount: r.expected_amount ?? 0, actual_amount: r.amount, difference_amount: diff, status: "open", ...base,
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
      error_log: JSON.stringify(rows.filter((r) => r.state === "error").slice(0, 200).map((r) => ({ line: r.line, errors: r.errors }))),
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
