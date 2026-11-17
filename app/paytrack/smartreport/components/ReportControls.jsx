import React from "react";

// Channel / period / wording options. Nothing here changes figures: it only chooses what to generate.
export default function ReportControls({ form, setForm, channels, onGenerate, onPrint, loading, canPrint }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  return (
    <div className="or-controls">
      <label>Channel
        <select value={form.channel} onChange={set("channel")}>
          <option value="">All channels</option>
          {channels.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </label>
      <label>From<input type="date" value={form.start} onChange={set("start")} /></label>
      <label>To<input type="date" value={form.end} onChange={set("end")} /></label>
      <label>Call the business
        <input type="text" value={form.business} onChange={set("business")} placeholder="business" style={{ width: 110 }} title="Used in sentences, e.g. 'the hotel', 'the shop', 'the clinic'. Optional." />
      </label>
      <label className="or-check"><input type="checkbox" checked={form.charts} onChange={set("charts")} /> Include charts</label>
      <label className="or-check"><input type="checkbox" checked={form.demo} onChange={set("demo")} /> Mark as demonstration</label>
      <label className="or-grow">Extra notes (optional)
        <input type="text" value={form.notes} onChange={set("notes")} placeholder="Shown at the end of page 1" />
      </label>
      <div className="or-actions">
        <button className="or-btn primary" onClick={onGenerate} disabled={loading}>
          <i className={`fa ${loading ? "fa-spinner fa-spin" : "fa-refresh"}`}></i> {loading ? "Generating..." : "Generate report"}
        </button>
        <button className="or-btn" onClick={onPrint} disabled={!canPrint}><i className="fa fa-file-pdf-o"></i> Save as PDF / Print</button>
      </div>
    </div>
  );
}
