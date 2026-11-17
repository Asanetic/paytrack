import { processAuthToken } from "../../../auth/authManager";
import { previewTransactions, commitTransactions, backfillRates, listImports, undoImport, listChannels } from "./engine";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export async function POST(req) {
  try {
    const { valid, data: authData, reason } = processAuthToken(req);
    if (!valid) return json({ success: false, status: "error", message: reason }, 403);

    const { mode, rows, fileName, importId, defaultChannel } = await req.json();

    if (mode === "preview") {
      return json({ success: true, status: "success", ...(await previewTransactions(rows, authData, defaultChannel)) });
    }
    if (mode === "commit") {
      return json({ success: true, status: "success", ...(await commitTransactions(rows, authData, fileName, defaultChannel)) });
    }
    if (mode === "channels") {
      return json({ success: true, status: "success", ...(await listChannels(authData)) });
    }
    if (mode === "history") {
      return json({ success: true, status: "success", ...(await listImports(authData)) });
    }
    if (mode === "undo") {
      return json({ success: true, status: "success", ...(await undoImport(importId, authData)) });
    }
    if (mode === "backfill") {
      return json({ success: true, status: "success", ...(await backfillRates(authData)) });
    }
    return json({ success: false, status: "error", message: "Invalid mode" }, 400);
  } catch (err) {
    console.error("Transaction import error:", err);
    return json({ success: false, status: "error", message: err.message }, 500);
  }
}
