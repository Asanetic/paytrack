import { NextResponse } from "next/server";
import { connectDB, activeDB } from "../../../apiUtils/dataControl/conn";
import { processAuthToken } from "../../../auth/authManager";

// ════════════════════════════════════════════════════════════════
// Events by type — grouped by event type + branch + date/period. Real
// SQL GROUP BY + SUM(amount), tenant-scoped, joined to branches for the
// branch name — same standalone-route approach as gatewayipn and the
// moneyflow bymethod/bybranch reports (not the grid's client-side
// "sum what's on the current page" convention).
//
//   GET /api/paytrack/events/type
//     ?period=day|month   (display granularity, default day)
//     &branchId=<base64 record_id>            (filter_by_branch)
//     &eventType=<base64 type>                 (filter_by_type)
//     &paymentMode=<base64 mode>               (filter_by_mode)
//     &occurredAt_start=<base64 YYYY-MM-DD>    (filter_by_date / presets)
//     &occurredAt_end=<base64 YYYY-MM-DD>
//
//   Filter param names/encoding match smartFilterActions.jsx's
//   advancedQuery convention (camelCase key, btoa'd value) — the same
//   actions registered in events/logicControl/actionsRegistry.js.
//
//   -> { status, data: [{ period, branch_id, branch_name, event_type, total, count }], grandTotal }
// ════════════════════════════════════════════════════════════════

const isDate = (val) => /^\d{4}-\d{2}-\d{2}$/.test(val);
const localDateStr = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const decode = (val) => {
  if (!val) return null;
  try { return atob(val); } catch { return val; }
};

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    const { valid, reason, data: authData } = processAuthToken(request);
    if (!valid) {
      return NextResponse.json({ status: "unauthorized", message: reason }, { status: 403 });
    }

    const hiveSiteId = authData?.hive_site_id;
    if (!hiveSiteId) {
      return NextResponse.json({ status: "error", message: "No tenant on this session." }, { status: 400 });
    }

    const period = searchParams.get("period") === "month" ? "month" : "day";
    const branchId = decode(searchParams.get("branchId"));
    const eventType = decode(searchParams.get("eventType"));
    const paymentMode = decode(searchParams.get("paymentMode"));
    const start = decode(searchParams.get("occurredAt_start"));
    const end = decode(searchParams.get("occurredAt_end"));

    const periodExpr = period === "month"
      ? "DATE_FORMAT(e.`occurred_at`, '%Y-%m')"
      : "DATE(e.`occurred_at`)";

    const where = ["e.`hive_site_id` = ?"];
    const values = [hiveSiteId];

    if (branchId) { where.push("e.`branch_id` = ?"); values.push(branchId); }
    if (eventType) { where.push("e.`event_type` = ?"); values.push(eventType); }
    if (paymentMode) { where.push("e.`payment_mode` = ?"); values.push(paymentMode); }
    if (start && isDate(start)) { where.push("e.`occurred_at` >= ?"); values.push(`${start} 00:00:00`); }
    if (end && isDate(end)) { where.push("e.`occurred_at` <= ?"); values.push(`${end} 23:59:59`); }

    const sql = `
      SELECT ${periodExpr} AS period,
             e.\`branch_id\` AS branch_id,
             b.\`branch_name\` AS branch_name,
             e.\`event_type\` AS event_type,
             SUM(e.\`amount\`) AS total,
             COUNT(*) AS count
      FROM \`${activeDB}\`.\`business_events\` e
      LEFT JOIN \`${activeDB}\`.\`branches\` b ON b.\`record_id\` = e.\`branch_id\`
      WHERE ${where.join(" AND ")}
      GROUP BY period, e.\`branch_id\`, e.\`event_type\`
      ORDER BY period DESC, branch_name ASC, event_type ASC
    `;

    const conn = await connectDB();
    const [rows] = await conn.execute(sql, values);

    const data = (rows || []).map((r) => ({
      period: r.period,
      branch_id: r.branch_id || "",
      branch_name: r.branch_name || "Unassigned branch",
      event_type: r.event_type || "Other",
      total: Number(r.total || 0),
      count: Number(r.count || 0),
    }));

    const grandTotal = data.reduce((s, r) => s + r.total, 0);

    return NextResponse.json({ status: "success", data, grandTotal, generatedAt: localDateStr() });
  } catch (error) {
    console.error("events/type error:", error);
    return NextResponse.json({ status: "error", message: error.message }, { status: 500 });
  }
}
