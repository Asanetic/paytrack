// GET /api/paytrack/smartreport?start=YYYY-MM-DD&end=YYYY-MM-DD[&channel=<channel name>]
// GET /api/paytrack/smartreport?channels=1   -> channel names for the picker
//
// Computes every figure the Owners Report needs; the wording lives in the UI templates.
// The statement details (origin, category, charges, balance...) live in each row's JSON "metadata" text.
// They are read here in code, not with SQL JSON functions, so this works on any MySQL / MariaDB version.
import { NextResponse } from "next/server";
import { connectDB, activeDB } from "../../apiUtils/dataControl/conn";
import { processAuthToken } from "../../auth/authManager";

const T = (t) => `\`${activeDB}\`.\`${t}\``;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[A-Za-z0-9]+$/;
const n = (v) => (v === null || v === undefined || v === "" || isNaN(v) ? 0 : Number(v));
const meta = (s) => { try { const o = JSON.parse(s); return o && typeof o === "object" ? o : {}; } catch { return {}; } };
const modeOf = (m) => String(m || "other").toLowerCase();
const stamp = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime()) || 0;

export async function GET(request) {
  const { valid, data: authData, reason } = processAuthToken(request);
  if (!valid) return NextResponse.json({ status: "unauthorized", message: reason }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const hive = authData.hive_site_id ?? null;
  const conn = await connectDB();

  try {
    if (searchParams.get("channels")) {
      const [rows] = await conn.query(`SELECT branch_name AS name FROM ${T("branches")} WHERE hive_site_id <=> ? ORDER BY branch_name`, [hive]);
      return NextResponse.json({ status: "success", channels: rows.map((r) => r.name) });
    }

    const start = searchParams.get("start") || "";
    const end = searchParams.get("end") || "";
    const channel = (searchParams.get("channel") || "").trim();
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      return NextResponse.json({ status: "error", message: "Choose a valid start and end date" }, { status: 400 });
    }
    const from = `${start} 00:00:00`;
    const to = `${end} 23:59:59`;

    // optional channel filter (channels are the branches table)
    const chan = (col) => (channel ? `AND ${col} IN (SELECT record_id FROM ${T("branches")} WHERE hive_site_id <=> ? AND branch_name = ?)` : "");
    const chanArgs = channel ? [hive, channel] : [];
    const q = async (sql, args) => (await conn.query(sql, args))[0];

    const inCols = `primkey, payment_mode, amount, rate_amount, disbursed, transaction_at AS at, metadata`;
    const outCols = `primkey, payment_mode, amount, occurred_at AS at, metadata`;

    const inRows = await q(
      `SELECT ${inCols} FROM ${T("payment_transactions")} WHERE hive_site_id <=> ? AND transaction_at BETWEEN ? AND ? ${chan("branch_id")}`,
      [hive, from, to, ...chanArgs]
    );
    const outRows = await q(
      `SELECT ${outCols} FROM ${T("business_events")} WHERE hive_site_id <=> ? AND event_type = 'Money Out' AND occurred_at BETWEEN ? AND ? ${chan("branch_id")}`,
      [hive, from, to, ...chanArgs]
    );

    // ---- money in, by mode (+ card origin, descriptions) ----
    const inMap = {}, origin = {}, descCount = {}, importIds = new Set();
    const balCandidates = [];
    for (const r of inRows) {
      const m = modeOf(r.payment_mode), md = meta(r.metadata);
      const a = (inMap[m] = inMap[m] || { mode: m, n: 0, total: 0, fees: 0, settled: 0 });
      a.n++; a.total += n(r.amount); a.fees += n(r.rate_amount); a.settled += n(r.disbursed);
      if (m === "card") {
        const k = md.origin || "Other";
        origin[k] = origin[k] || { origin: k, n: 0, total: 0 };
        origin[k].n++; origin[k].total += n(r.amount);
      }
      if (md.description) {
        const d = String(md.description).trim();
        const key = `${m}|${d.toLowerCase()}`;
        descCount[key] = descCount[key] || { mode: m, d, c: 0 };
        descCount[key].c++;
      }
      if (md.import_id && ID_RE.test(md.import_id)) importIds.add(md.import_id);
      if (md.balance !== undefined && md.balance !== "") balCandidates.push({ mode: m, bal: n(md.balance), t: stamp(r.at), p: r.primkey, at: r.at });
    }

    // ---- money out, by mode + category ----
    const outMap = {};
    for (const r of outRows) {
      const m = modeOf(r.payment_mode), md = meta(r.metadata);
      const cat = String(md.category || "").trim() || "Other payments";
      const a = (outMap[`${m}|${cat}`] = outMap[`${m}|${cat}`] || { mode: m, category: cat, n: 0, total: 0, fees: 0 });
      a.n++; a.total += n(r.amount); a.fees += n(md.charges);
      if (md.import_id && ID_RE.test(md.import_id)) importIds.add(md.import_id);
      if (md.balance !== undefined && md.balance !== "") balCandidates.push({ mode: m, bal: n(md.balance), t: stamp(r.at), p: r.primkey, at: r.at });
    }

    // what customers paid for: most common distinct descriptions per mode
    const descriptions = {};
    Object.values(descCount).sort((a, b) => b.c - a.c).forEach((x) => {
      descriptions[x.mode] = descriptions[x.mode] || [];
      if (descriptions[x.mode].length < 12) descriptions[x.mode].push(x.d);
    });

    // latest running balance per mode
    const balances = {};
    balCandidates.sort((a, b) => b.t - a.t || b.p - a.p).forEach((c) => { if (!balances[c.mode]) balances[c.mode] = { balance: c.bal, date: c.at }; });

    // ---- entries from the same uploaded files that fall outside the chosen period ----
    const outsideMap = {};
    if (importIds.size) {
      const ids = [...importIds];
      const likeSql = ids.map(() => "metadata LIKE ?").join(" OR ");
      const likeArgs = ids.map((id) => `%"import_id":"${id}"%`);
      const add = (r, fees) => {
        const m = modeOf(r.payment_mode);
        const a = (outsideMap[m] = outsideMap[m] || { mode: m, n: 0, total: 0, fees: 0, first_date: r.at, last_date: r.at });
        a.n++; a.total += n(r.amount); a.fees += fees;
        if (stamp(r.at) < stamp(a.first_date)) a.first_date = r.at;
        if (stamp(r.at) > stamp(a.last_date)) a.last_date = r.at;
      };
      const oi = await q(
        `SELECT payment_mode, amount, rate_amount, transaction_at AS at FROM ${T("payment_transactions")}
         WHERE hive_site_id <=> ? AND (${likeSql}) AND (transaction_at < ? OR transaction_at > ?) ${chan("branch_id")}`,
        [hive, ...likeArgs, from, to, ...chanArgs]
      );
      oi.forEach((r) => add(r, n(r.rate_amount)));
      const oo = await q(
        `SELECT payment_mode, amount, occurred_at AS at, metadata FROM ${T("business_events")}
         WHERE hive_site_id <=> ? AND event_type = 'Money Out' AND (${likeSql}) AND (occurred_at < ? OR occurred_at > ?) ${chan("branch_id")}`,
        [hive, ...likeArgs, from, to, ...chanArgs]
      );
      oo.forEach((r) => add(r, n(meta(r.metadata).charges)));
    }

    // card statement check: stated fee must agree with amount minus net settlement
    const [mm] = await q(
      `SELECT COUNT(*) AS c FROM ${T("exceptions")} e JOIN ${T("payment_transactions")} p ON p.record_id = e.payment_transaction_id
       WHERE e.hive_site_id <=> ? AND e.exception_type = 'charge_mismatch' AND LOWER(p.payment_mode) = 'card'
         AND p.transaction_at BETWEEN ? AND ? ${chan("p.branch_id")}`,
      [hive, from, to, ...chanArgs]
    );

    return NextResponse.json({
      status: "success",
      data: {
        merchant: channel || "All channels",
        period: { start, end },
        in: Object.values(inMap),
        out: Object.values(outMap),
        card_origin: Object.values(origin),
        descriptions,
        balances,
        outside: Object.values(outsideMap),
        card_mismatches: n(mm?.c),
      },
    });
  } catch (err) {
    console.error("smartreport error:", err);
    return NextResponse.json({ status: "error", message: err.message }, { status: 500 });
  } finally {
    await conn.end();
  }
}
