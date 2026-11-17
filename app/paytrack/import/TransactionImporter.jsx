"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { mosyPostData } from "../../MosyUtils/hiveUtils";
import { getApiRoutes } from "../AppRoutes/apiRoutesHandler";

const endpoint = getApiRoutes().payments.importTransactions;
const MAX_BYTES = 10 * 1024 * 1024;

// Original column order, with the money columns grouped in the acquirer statement's order
// (Gross, Fee %, Fee, Net). Optional statement details sit at the end.
// The statement's own header names are also accepted, so an exported statement can be uploaded as-is.
const HEADERS = ["type", "transaction_id", "transaction_date", "channel", "payment_mode", "amount", "rate", "charges", "settled_amount", "currency", "payer_name", "payer_phone", "reference", "expected_amount", "status", "settlement_date", "card_scheme", "origin", "description", "batch"];
const sampleRows = (ch) => [
  // full statement row: gross, fee %, fee and net all present
  ["money_in", "SC-HOT-0002", "2026-11-04", ch, "card", 8500, 2.5, 212.5, 8287.5, "KES", "", "", "GUEST-1062", "", "completed", "2026-11-05", "Visa", "International", "Restaurant and bar", "BATCH-261104-01"],
  // only the net settlement is known: fee and rate are worked out (437.50 = 3.5%)
  ["money_in", "SC-HOT-0003", "2026-11-07", ch, "card", 12500, "", "", 12062.5, "KES", "", "", "GUEST-1093", "", "completed", "2026-11-08", "Mastercard", "Domestic", "Conference booking", "BATCH-261107-01"],
  // no fee info at all: the channel's configured rate is used
  ["money_in", "MP-0001", "2026-11-08", ch, "mpesa", 5000, "", "", "", "KES", "Jane Wanjiku", "0711000001", "INV-2001", 5000, "completed", "", "", "", "Walk-in payment", ""],
  ["money_out", "OUT-5001", "2026-11-09", ch, "bank", 3000, "", "", "", "KES", "Office Supplies Ltd", "0733000009", "PO-221", "", "completed", "", "", "", "Supplier payment", ""],
];
const SAMPLE = sampleRows("Savannah Crown");
const GUIDE = [
  ["Column", "Required", "Notes"],
  ["type", "No", "money_in (default) or money_out. Money out is saved as a Money Out business event"],
  ["transaction_id", "Yes", "Statement 'Transaction ID'. Unique per payment; duplicates are skipped on re-upload"],
  ["transaction_date", "Yes", "Statement 'Txn Date'. YYYY-MM-DD (time optional)"],
  ["channel", "Yes*", "Channel name; created if new. *Can be left out if you pick a channel for the file on the upload screen. See the Channels sheet"],
  ["payment_mode", "Yes*", "mpesa / cash / card / bank. *Blank defaults to card when card_scheme is filled"],
  ["amount", "Yes*", "Statement 'Gross'. What the client paid. *If blank it is rebuilt from fee + net, fee + rate, or net + rate"],
  ["rate", "No", "Statement 'Fee %'. Blank = worked out, or the channel's rate"],
  ["charges", "No", "Statement 'Fee'. Actual fee amount"],
  ["settled_amount", "No", "Statement 'Net'. What the merchant actually received. Trusted over fee and rate; if they disagree the row is flagged 'charge mismatch'"],
  ["currency", "No", "Default KES"],
  ["payer_name / payer_phone", "No", "Money in: client created/linked. Money out: payee name/phone"],
  ["reference", "No", "Statement 'Guest Ref' / invoice / receipt ref. Same ref + amount twice = possible duplicate"],
  ["expected_amount", "No", "Difference of 1 or more is flagged as underpaid / overpaid"],
  ["status", "No", "Default completed"],
  ["settlement_date / card_scheme / origin / description / batch", "No", "Statement 'Settlement Date', 'Card', 'Origin', 'Description', 'Batch'. Kept on the transaction"],
];

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const label = (k) => String(k).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const size = (b) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`);

// channels = the live channel list (name + configured rates), merged into the template as a reference sheet
function downloadTemplate(channels = []) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([HEADERS, ...(channels.length ? sampleRows(channels[0].name) : SAMPLE)]);
  ws["!cols"] = HEADERS.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  const pct = (v) => (v === null || v === undefined || v === "" ? "" : Number(v));
  const c = XLSX.utils.aoa_to_sheet([
    ["Channel (use exactly this name)", "Cash %", "Card %", "M-Pesa %", "Default %"],
    ...channels.map((x) => [x.name, pct(x.cash), pct(x.card), pct(x.mpesa), pct(x.default)]),
    ...(channels.length ? [] : [["(no channels yet, new ones are created from the channel column)"]]),
  ]);
  c["!cols"] = [{ wch: 34 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, c, "Channels");

  const g = XLSX.utils.aoa_to_sheet(GUIDE);
  g["!cols"] = [{ wch: 38 }, { wch: 10 }, { wch: 110 }];
  XLSX.utils.book_append_sheet(wb, g, "Guide");
  XLSX.writeFile(wb, "paytrack_transactions_template.xlsx");
}

const Pill = ({ tone = "", children }) => <span className={`imp-pill ${tone}`}>{children}</span>;
const PILL_TONE = { in: "", out: "red", valid: "", error: "red", duplicate: "muted", underpaid: "amber", overpaid: "blue", possible_duplicate: "amber", charge_mismatch: "amber", amount_derived: "blue", unverified: "muted" };
const INFO_FLAGS = ["unverified", "amount_derived"]; // informational only, not counted as "flagged"

function Stat({ label: l, value, tone = "" }) {
  return (
    <div className="imp-stat">
      <div className={`imp-stat-v ${tone}`}>{value}</div>
      <div className="imp-stat-l">{l}</div>
    </div>
  );
}

function Breakdown({ title, items }) {
  const max = Math.max(...items.map((i) => Math.abs(i.total)), 1);
  return (
    <div className="imp-card imp-bd">
      <div className="imp-bd-t">{title}</div>
      {items.slice(0, 6).map((i) => (
        <div key={i.key} className="imp-bd-row">
          <div className="imp-bd-top"><span>{i.key}</span><span className={i.total < 0 ? "red" : ""}>{money(i.total)}</span></div>
          <div className="imp-bd-sub"><span className="green">+{money(i.in)}</span><span className="red">-{money(i.out)}</span></div>
          <div className="imp-bar"><i style={{ width: `${(Math.abs(i.total) / max) * 100}%`, background: i.total < 0 ? "#dc2626" : undefined }} /></div>
        </div>
      ))}
      {!items.length && <div className="imp-empty">No data</div>}
    </div>
  );
}

function Summary({ s }) {
  return (
    <>
      <div className="imp-stats">
        <Stat label="Rows in file" value={s.total_rows} />
        <Stat label="Ready to import" value={s.valid} tone="green" />
        <Stat label="Errors" value={s.errors} tone={s.errors ? "red" : ""} />
        <Stat label="Duplicates skipped" value={s.duplicates} />
        <Stat label="Flagged (needs review)" value={s.underpaid + s.overpaid + s.possible_duplicates + s.charge_mismatches} tone={s.underpaid + s.overpaid + s.possible_duplicates + s.charge_mismatches ? "amber" : ""} />
        <Stat label={`Money in (${s.count_in})`} value={money(s.money_in)} tone="green" />
        <Stat label={`Money out (${s.count_out})`} value={money(s.money_out)} tone={s.money_out ? "red" : ""} />
        <Stat label="Net" value={money(s.net)} tone={s.net < 0 ? "red" : "green"} />
        <Stat label="Charges" value={money(s.total_charges)} tone="amber" />
        <Stat label="Disbursed" value={money(s.total_disbursed)} tone="green" />
      </div>
      <div className="imp-bds">
        <Breakdown title="By channel" items={s.by_branch} />
        <Breakdown title="By payment mode" items={s.by_mode} />
        <Breakdown title="By day" items={s.by_day} />
      </div>
    </>
  );
}

export default function TransactionImporter({ title = "Import Transactions", subtitle = "Upload an Excel sheet. We validate it, create missing branches and clients, then run the analysis.", section = "Data management" }) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [rawRows, setRawRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | validating | uploading | done
  const [dragOver, setDragOver] = useState(false);
  const [fillMsg, setFillMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [channels, setChannels] = useState([]);
  const [defaultChannel, setDefaultChannel] = useState(""); // applied to rows whose channel cell is blank
  const [undoing, setUndoing] = useState("");
  const [notice, setNotice] = useState("");

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const validated = !!preview;
  const s = preview?.summary;

  function resetParsed() {
    setRawRows([]); setPreview(null); setResult(null); setStatus("idle");
    setQ(""); setFilter("all"); setTypeFilter("all"); setPage(1);
  }

  function selectFile(f) {
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setFileError("Only .xlsx, .xls or .csv files are supported.");
    if (f.size > MAX_BYTES) return setFileError(`File is too large (${size(f.size)}). Maximum is 10 MB.`);
    setFileError(""); setFile(f); resetParsed();
  }

  function handleClear() {
    setFile(null); setFileError(""); resetParsed();
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleValidate() {
    if (!file) return;
    setStatus("validating"); setFileError("");
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
      const sheet = wb.Sheets[wb.SheetNames.find((n) => /transaction/i.test(n)) || wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: false, dateNF: "yyyy-mm-dd hh:mm:ss", defval: "", blankrows: false });
      if (!rows.length) throw new Error("The file has no usable rows.");

      const res = await mosyPostData({ url: endpoint, data: { mode: "preview", rows, defaultChannel } });
      if (res.status !== "success") throw new Error(res.message || "Validation failed");
      setRawRows(rows); setPreview(res); setPage(1); setStatus("idle");
    } catch (e) {
      setFileError(e.message); setStatus("idle");
    }
  }

  async function handleFillRates() {
    setFillMsg("Filling rates...");
    try {
      const res = await mosyPostData({ url: endpoint, data: { mode: "backfill" } });
      if (res.status !== "success") throw new Error(res.message || "Failed");
      setFillMsg(`Done: ${res.updated} existing transaction(s) updated with channel rates.`);
    } catch (e) {
      setFillMsg(`Failed: ${e.message}`);
    }
  }

  async function loadHistory() {
    try {
      const res = await mosyPostData({ url: endpoint, data: { mode: "history" } });
      if (res.status === "success") setHistory(res.imports || []);
    } catch { /* history is optional */ }
  }
  async function loadChannels() {
    try {
      const res = await mosyPostData({ url: endpoint, data: { mode: "channels" } });
      if (res.status === "success") setChannels(res.channels || []);
    } catch { /* picker is optional */ }
  }
  useEffect(() => { loadHistory(); loadChannels(); }, []);

  async function handleUndo(importId, name) {
    if (undoing) return;
    if (!window.confirm(`Undo the import "${name}"?\n\nThis permanently removes the transactions, money out events and exceptions it created, plus any channels or clients it added that nothing else uses.`)) return;
    setUndoing(importId); setFileError(""); setNotice("");
    try {
      const res = await mosyPostData({ url: endpoint, data: { mode: "undo", importId } });
      if (res.status !== "success") throw new Error(res.message || "Undo failed");
      const r = res.removed;
      setNotice(`Import undone: removed ${r.transactions} transaction(s), ${r.events} money out event(s), ${r.exceptions} exception(s)` +
        `${r.channels ? `, ${r.channels} channel(s)` : ""}${r.clients ? `, ${r.clients} client(s)` : ""}. You can fix the file and import again.`);
      if (result?.import_id === importId) { setResult(null); setPreview(null); setStatus("idle"); }
      await loadHistory();
    } catch (e) {
      setFileError(e.message);
    } finally {
      setUndoing("");
    }
  }

  async function handleImport() {
    if (!validated || !s.valid || status !== "idle") return;
    setStatus("uploading"); setFileError(""); setNotice("");
    try {
      const res = await mosyPostData({ url: endpoint, data: { mode: "commit", rows: rawRows, fileName: file.name, defaultChannel } });
      if (res.status !== "success") throw new Error(res.message || "Import failed");
      setResult(res); setStatus("done"); loadHistory();
    } catch (e) {
      setFileError(e.message); setStatus("idle"); // failure rolls back, so retry is safe
    }
  }

  const rows = useMemo(() => {
    if (!preview) return [];
    const term = q.trim().toLowerCase();
    return preview.rows.filter((r) => {
      if (filter === "flagged" ? !(r.state === "valid" && r.flags.some((f) => !INFO_FLAGS.includes(f))) : filter !== "all" && r.state !== filter) return false;
      if (typeFilter !== "all" && r.direction !== typeFilter) return false;
      return !term || [r.transaction_id, r.branch, r.payment_mode, r.payer_name, r.reference].some((v) => String(v ?? "").toLowerCase().includes(term));
    });
  }, [preview, q, filter, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(rows.length / perPage));
  const start = (page - 1) * perPage;
  const shown = rows.slice(start, start + perPage);
  const isFiltered = q !== "" || filter !== "all" || typeFilter !== "all";

  function pageButtons() {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const out = [1];
    const l = Math.max(2, page - 2), r = Math.min(totalPages - 1, page + 2);
    if (l > 2) out.push("...");
    for (let i = l; i <= r; i++) out.push(i);
    if (r < totalPages - 1) out.push("...");
    return [...out, totalPages];
  }

  const canImport = validated && s.valid > 0 && status === "idle";
  const busy = status === "validating" || status === "uploading";

  return (
    <div className="imp-wrap">
      <style>{`
        .imp-wrap { --g: #1a7f4b; --gd: #146339; --gs: #e8f5ee; color: #111827; }
        .imp-crumb { font-size: .8rem; color: #6b7280; } .imp-crumb .cur { color: var(--g); }
        .imp-title { font-size: 1.6rem; font-weight: 700; margin: .2rem 0 .1rem; }
        .imp-sub { color: #6b7280; margin-bottom: 1rem; }
        .imp-card { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 14px; }
        .imp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 768px) { .imp-grid { grid-template-columns: 1fr; } }
        .imp-drop { border: 2px dashed #cbd5e1; border-radius: 10px; min-height: 150px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; cursor: pointer; background: #fafbfc; padding: 16px; transition: .15s; }
        .imp-drop.over { border-color: var(--g); background: #f0fdf4; }
        .imp-drop-icon { width: 42px; height: 42px; border-radius: 10px; background: var(--gs); color: var(--g); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; margin-bottom: 10px; }
        .imp-browse { color: var(--g); font-weight: 600; } .imp-hint { font-size: .75rem; color: #6b7280; margin-top: 4px; }
        .imp-right { display: flex; flex-direction: column; gap: 12px; justify-content: center; }
        .imp-file { display: flex; align-items: center; gap: 12px; border: 1px solid #e5e7eb; border-radius: 10px; padding: 10px 12px; min-height: 58px; }
        .imp-file-icon { width: 34px; height: 34px; border-radius: 8px; background: var(--gs); display: flex; align-items: center; justify-content: center; color: var(--g); }
        .imp-file-name { font-weight: 600; font-size: .9rem; word-break: break-all; } .imp-file-meta { font-size: .75rem; color: #6b7280; }
        .imp-file-empty { color: #9ca3af; font-size: .9rem; }
        .imp-x { background: none; border: 0; color: #6b7280; cursor: pointer; padding: 4px 6px; }
        .imp-chan { display: flex; flex-direction: column; gap: 4px; margin: 0; font-size: .8rem; color: #4b5563; }
        .imp-chan select { border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: .88rem; background: #fff; color: #111827; }
        .imp-chan small { color: #6b7280; font-size: .72rem; }
        .imp-actions { display: grid; grid-template-columns: 1.1fr 1.1fr .8fr; gap: 8px; }
        @media (max-width: 520px) { .imp-actions { grid-template-columns: 1fr; } }
        .imp-btn { border: 1px solid #d1d5db; background: #fff; color: #111827; border-radius: 8px; padding: 9px 12px; font-weight: 600; font-size: .88rem; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; gap: 8px; }
        .imp-btn:hover:not(:disabled) { background: #f9fafb; } .imp-btn:disabled { opacity: .5; cursor: not-allowed; }
        .imp-btn.primary { background: var(--g); border-color: var(--g); color: #fff; } .imp-btn.primary:hover:not(:disabled) { background: var(--gd); }
        .imp-alert { display: flex; align-items: center; gap: 10px; border-radius: 10px; padding: 11px 14px; margin-bottom: 14px; font-size: .9rem; }
        .imp-alert .ico { width: 22px; height: 22px; border-radius: 50%; color: #fff; display: flex; align-items: center; justify-content: center; font-size: .7rem; flex: none; }
        .imp-alert.err { background: #fdecee; border: 1px solid #f5c2c7; color: #7f1d1d; } .imp-alert.err .ico { background: #dc2626; }
        .imp-alert.warn { background: #fff7e6; border: 1px solid #fde1a6; color: #7a4b00; } .imp-alert.warn .ico { background: #d97706; }
        .imp-alert.ok { background: #e8f5ee; border: 1px solid #b7e1c7; color: #14532d; } .imp-alert.ok .ico { background: var(--g); }
        .imp-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 14px; }
        .imp-stat { background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px 14px; }
        .imp-stat-v { font-size: 1.3rem; font-weight: 700; } .imp-stat-l { font-size: .75rem; color: #6b7280; }
        .green { color: var(--g); } .red { color: #dc2626; } .amber { color: #b45309; }
        .imp-bds { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        @media (max-width: 992px) { .imp-bds { grid-template-columns: 1fr; } }
        .imp-bd-t { font-weight: 700; font-size: .9rem; margin-bottom: 10px; }
        .imp-bd-row { margin-bottom: 9px; } .imp-bd-top { display: flex; justify-content: space-between; font-size: .8rem; margin-bottom: 3px; }
        .imp-bd-sub { display: flex; justify-content: space-between; font-size: .7rem; margin-bottom: 3px; }
        .imp-bar { height: 6px; background: #eef2f7; border-radius: 99px; overflow: hidden; } .imp-bar i { display: block; height: 100%; background: var(--g); border-radius: 99px; }
        .imp-head { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .imp-head h5 { margin: 0; font-weight: 700; font-size: 1.05rem; }
        .imp-badge { background: #eef2f7; color: #374151; border-radius: 999px; padding: 2px 10px; font-size: .75rem; font-weight: 600; margin-left: 8px; }
        .imp-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
        .imp-tools input[type=search], .imp-tools select { border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: .82rem; background: #fff; }
        .imp-tools input[type=search] { min-width: 210px; }
        .imp-tools label { margin: 0; font-size: .8rem; color: #4b5563; display: inline-flex; align-items: center; gap: 6px; }
        .imp-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: .85rem; }
        .imp-table th { background: #f3f4f6; color: #374151; font-weight: 600; font-size: .78rem; padding: 10px 12px; white-space: nowrap; text-align: left; }
        .imp-table th:first-child { border-radius: 8px 0 0 8px; } .imp-table th:last-child { border-radius: 0 8px 8px 0; }
        .imp-table td { padding: 11px 12px; border-bottom: 1px solid #eef0f3; vertical-align: top; }
        .imp-table .num { text-align: right; white-space: nowrap; } .imp-table tr.bad td { background: #fff1f2; }
        .imp-err { color: #b91c1c; font-size: .75rem; margin-top: 3px; }
        .imp-pill { display: inline-flex; align-items: center; gap: 6px; background: #dcfce7; color: #166534; border-radius: 999px; padding: 2px 10px; font-size: .72rem; font-weight: 600; margin-right: 4px; }
        .imp-pill::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
        .imp-pill.muted { background: #f3f4f6; color: #4b5563; } .imp-pill.red { background: #fee2e2; color: #991b1b; }
        .imp-pill.amber { background: #fef3c7; color: #92400e; } .imp-pill.blue { background: #dbeafe; color: #1e40af; }
        .imp-foot { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; justify-content: space-between; margin-top: 12px; }
        .imp-foot small { color: #6b7280; } .imp-pager { display: flex; gap: 6px; }
        .imp-page { min-width: 32px; height: 32px; border-radius: 8px; border: 1px solid #e5e7eb; background: #fff; color: #374151; cursor: pointer; font-size: .82rem; }
        .imp-page.active { background: var(--g); border-color: var(--g); color: #fff; font-weight: 600; } .imp-page:disabled { opacity: .45; cursor: not-allowed; }
        .imp-empty { text-align: center; color: #6b7280; padding: 22px 0; }
      `}</style>

      <div className="imp-crumb">{section} / <span className="cur">{title}</span></div>
      <h1 className="imp-title">{title}</h1>
      <div className="imp-sub">{subtitle}</div>

      {/* upload */}
      <div className="imp-card">
        <div className="imp-grid">
          <div
            className={`imp-drop ${dragOver ? "over" : ""}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => { e.preventDefault(); setDragOver(false); selectFile(e.dataTransfer.files?.[0]); }}
          >
            <div className="imp-drop-icon"><i className="fa fa-cloud-upload"></i></div>
            <div>Drop your Excel file here or <span className="imp-browse">browse</span></div>
            <div className="imp-hint">.xlsx, .xls or .csv · Maximum 10 MB</div>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => selectFile(e.target.files?.[0])} />
          </div>

          <div className="imp-right">
            <div className="imp-file">
              {file ? (
                <>
                  <div className="imp-file-icon"><i className="fa fa-file-excel-o"></i></div>
                  <div style={{ flex: 1 }}>
                    <div className="imp-file-name">{file.name}</div>
                    <div className="imp-file-meta">{validated ? `${s.total_rows} rows · ` : ""}{size(file.size)}</div>
                  </div>
                  {validated && <i className={`fa ${s.errors ? "fa-exclamation-circle" : "fa-check-circle"}`} style={{ fontSize: "1.3rem", color: s.errors ? "#d97706" : "var(--g)" }}></i>}
                  <button className="imp-x" onClick={handleClear} title="Remove file" disabled={busy}><i className="fa fa-times"></i></button>
                </>
              ) : (
                <span className="imp-file-empty">No file selected</span>
              )}
            </div>

            <label className="imp-chan">
              <span>Channel for this file</span>
              <select value={defaultChannel} disabled={busy} onChange={(e) => { setDefaultChannel(e.target.value); if (validated) resetParsed(); }}>
                <option value="">Use the channel column in the sheet</option>
                {channels.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <small>For a merchant statement with no channel column, pick the merchant's channel here.</small>
            </label>

            <div className="imp-actions">
              {!validated ? (
                <button className="imp-btn primary" onClick={handleValidate} disabled={!file || busy}>
                  <i className={`fa ${status === "validating" ? "fa-spinner fa-spin" : "fa-check"}`}></i>
                  {status === "validating" ? "Validating..." : "Validate file"}
                </button>
              ) : (
                <button className="imp-btn primary" onClick={handleImport} disabled={!canImport}>
                  <i className={`fa ${status === "uploading" ? "fa-spinner fa-spin" : status === "done" ? "fa-check" : "fa-upload"}`}></i>
                  {status === "uploading" ? "Importing..." : status === "done" ? "Imported" : `Import ${s.valid} rows`}
                </button>
              )}
              <button className="imp-btn" onClick={() => downloadTemplate(channels)}><i className="fa fa-download"></i> Download template</button>
              <button className="imp-btn" onClick={handleClear} disabled={busy}><i className="fa fa-trash-o"></i> Clear</button>
            </div>
            <div className="imp-hint" style={{ marginTop: 0 }}>
              Rates come from each channel (mode rate, else channel default).{" "}
              <a style={{ color: "var(--g)", fontWeight: 600, cursor: "pointer" }} onClick={handleFillRates}>Fill rates on existing transactions</a>
              {fillMsg && <div>{fillMsg}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* alerts */}
      {fileError && <div className="imp-alert err"><span className="ico"><i className="fa fa-exclamation"></i></span><span>{fileError}</span></div>}
      {validated && status !== "done" && (s.errors > 0 || s.duplicates > 0) && (
        <div className="imp-alert warn">
          <span className="ico"><i className="fa fa-exclamation"></i></span>
          <span>
            {s.errors > 0 && <><strong>{s.errors}</strong> row{s.errors > 1 ? "s have" : " has"} errors. </>}
            {s.duplicates > 0 && <><strong>{s.duplicates}</strong> duplicate{s.duplicates > 1 ? "s" : ""} already imported or repeated. </>}
            These will be skipped; the remaining {s.valid} valid rows can be imported.
          </span>
        </div>
      )}
      {status === "done" && result && (
        <div className="imp-alert ok">
          <span className="ico"><i className="fa fa-check"></i></span>
          <span>
            Imported <strong>{result.summary.count_in}</strong> money in and <strong>{result.summary.count_out}</strong> money out
            {result.summary.new_branches > 0 && `, ${result.summary.new_branches} new channel(s)`}
            {result.summary.new_clients > 0 && `, ${result.summary.new_clients} new client(s)`}
            {`, ${result.exceptions.length} exception(s) raised.`}
          </span>
          <button className="imp-btn" style={{ marginLeft: "auto" }} disabled={!!undoing} onClick={() => handleUndo(result.import_id, file?.name || "this import")}>
            <i className={`fa ${undoing === result.import_id ? "fa-spinner fa-spin" : "fa-undo"}`}></i> Undo import
          </button>
        </div>
      )}
      {notice && <div className="imp-alert ok"><span className="ico"><i className="fa fa-undo"></i></span><span>{notice}</span></div>}

      {/* analysis */}
      {validated && <Summary s={status === "done" && result ? result.summary : s} />}

      {/* exceptions after import */}
      {status === "done" && result && (
        <div className="imp-card">
          <div className="imp-head"><h5>Exceptions raised <span className="imp-badge">{result.exceptions.length}</span></h5></div>
          <div className="table-responsive">
            <table className="imp-table">
              <thead><tr><th>Type</th><th>Details</th><th className="num">Expected</th><th className="num">Actual</th><th className="num">Difference</th></tr></thead>
              <tbody>
                {result.exceptions.map((e, i) => (
                  <tr key={i}>
                    <td><Pill tone={PILL_TONE[e.type]}>{label(e.type)}</Pill></td>
                    <td>{e.description}</td>
                    <td className="num">{money(e.expected)}</td>
                    <td className="num">{money(e.actual)}</td>
                    <td className={`num ${e.difference < 0 ? "red" : ""}`}>{money(e.difference)}</td>
                  </tr>
                ))}
                {!result.exceptions.length && <tr><td colSpan={5}><div className="imp-empty">No exceptions, everything reconciles.</div></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* preview */}
      {validated && (
        <div className="imp-card">
          <div className="imp-head">
            <h5>Data preview <span className="imp-badge">{s.total_rows} rows</span></h5>
            <div className="imp-tools">
              <input type="search" placeholder="Search loaded rows..." value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
              <select value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }}>
                <option value="all">All rows</option>
                <option value="valid">Valid ({s.valid})</option>
                <option value="flagged">Flagged ({s.underpaid + s.overpaid + s.possible_duplicates + s.charge_mismatches})</option>
                <option value="error">Errors ({s.errors})</option>
                <option value="duplicate">Duplicates ({s.duplicates})</option>
              </select>
              <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}>
                <option value="all">In &amp; out</option>
                <option value="in">Money in</option>
                <option value="out">Money out</option>
              </select>
              <label>
                Rows per page:
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}>
                  {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </label>
              {isFiltered && <button className="imp-btn" style={{ padding: "5px 10px" }} onClick={() => { setQ(""); setFilter("all"); setTypeFilter("all"); setPage(1); }}>Reset</button>}
            </div>
          </div>

          <div className="table-responsive">
            <table className="imp-table">
              <thead>
                <tr><th>#</th><th>Type</th><th>Transaction ID</th><th>Date</th><th>Channel</th><th>Mode</th><th>Payer / Payee</th><th>Reference</th><th className="num">Amount</th><th className="num">Rate %</th><th className="num">Charges</th><th className="num">Disbursed</th><th className="num">Expected</th><th>Status</th></tr>
              </thead>
              <tbody>
                {!shown.length && <tr><td colSpan={14}><div className="imp-empty">No rows match your search.</div></td></tr>}
                {shown.map((r) => (
                  <tr key={r.line} className={r.state === "error" ? "bad" : ""}>
                    <td>{r.line - 1}</td>
                    <td>{r.direction ? <Pill tone={PILL_TONE[r.direction]}>{r.direction === "in" ? "Money in" : "Money out"}</Pill> : "-"}</td>
                    <td>{r.transaction_id || "-"}</td>
                    <td>{r.transaction_at || "-"}</td>
                    <td>{r.branch || "-"}</td>
                    <td>{r.payment_mode ? label(r.payment_mode) : "-"}</td>
                    <td>{r.payer_name || "-"}</td>
                    <td>{r.reference || "-"}</td>
                    <td className="num">{r.amount === null ? "-" : money(r.amount)}</td>
                    <td className="num">{r.rate === null ? "-" : r.rate}{r.rate_source && r.rate_source !== "channel" && <div className="imp-hint" style={{ margin: 0 }}>{r.rate_source}</div>}</td>
                    <td className="num">{r.charge === null ? "-" : money(r.charge)}</td>
                    <td className="num">{r.disbursed === null ? "-" : money(r.disbursed)}</td>
                    <td className="num">{r.expected_amount === null ? "-" : money(r.expected_amount)}</td>
                    <td>
                      <Pill tone={PILL_TONE[r.state]}>{label(r.state)}</Pill>
                      {r.flags.map((f) => <Pill key={f} tone={PILL_TONE[f]}>{label(f)}</Pill>)}
                      {r.errors.length > 0 && <div className="imp-err">{r.errors.join("; ")}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="imp-foot">
            <small>
              Showing {rows.length ? start + 1 : 0} to {Math.min(start + perPage, rows.length)} of {rows.length} rows
              {rows.length !== s.total_rows && ` (filtered from ${s.total_rows})`}
            </small>
            <div className="imp-pager">
              <button className="imp-page" disabled={page === 1} onClick={() => setPage(page - 1)}><i className="fa fa-chevron-left"></i></button>
              {pageButtons().map((p, i) =>
                p === "..." ? <span key={i} className="imp-page" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", border: 0 }}>…</span>
                  : <button key={i} className={`imp-page ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>
              )}
              <button className="imp-page" disabled={page === totalPages} onClick={() => setPage(page + 1)}><i className="fa fa-chevron-right"></i></button>
            </div>
          </div>
        </div>
      )}

      {/* import history */}
      {history.length > 0 && (
        <div className="imp-card">
          <div className="imp-head"><h5>Recent imports <span className="imp-badge">{history.length}</span></h5></div>
          <div className="table-responsive">
            <table className="imp-table">
              <thead><tr><th>File</th><th>When</th><th className="num">Imported</th><th className="num">Skipped</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.record_id}>
                    <td>{h.file_name || "-"}</td>
                    <td>{h.completed_at ? new Date(h.completed_at).toLocaleString() : "-"}</td>
                    <td className="num">{h.successful_rows} / {h.total_rows}</td>
                    <td className="num">{Number(h.failed_rows || 0) + Number(h.duplicate_rows || 0)}</td>
                    <td><Pill tone={h.status === "completed" ? "" : "muted"}>{label(h.status)}</Pill></td>
                    <td className="num">
                      {h.status === "completed" && (
                        <button className="imp-btn" style={{ padding: "5px 10px" }} disabled={!!undoing} onClick={() => handleUndo(h.record_id, h.file_name || "this import")}>
                          <i className={`fa ${undoing === h.record_id ? "fa-spinner fa-spin" : "fa-undo"}`}></i> Undo
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
