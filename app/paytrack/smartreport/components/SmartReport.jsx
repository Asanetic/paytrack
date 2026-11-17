"use client";
import React, { useEffect, useState } from "react";
import { mosyGetData } from "../../../MosyUtils/hiveUtils";
import { getApiRoutes } from "../../AppRoutes/apiRoutesHandler";
import ReportControls from "./ReportControls";
import OwnersReport from "./OwnersReport";
import "./report.css";

const endpoint = getApiRoutes().smartreport.base;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // local date, not UTC

export default function SmartReport() {
  const today = new Date();
  const [form, setForm] = useState({
    channel: "", start: ymd(new Date(today.getFullYear(), today.getMonth(), 1)), end: ymd(today),
    business: "hotel", demo: false, charts: true, notes: "",
  });
  const [channels, setChannels] = useState([]);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState(null); // wording options captured at generate time
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mosyGetData({ endpoint, params: { channels: 1 } }).then((r) => { if (r?.status === "success") setChannels(r.channels || []); });
  }, []);

  async function generate() {
    setLoading(true); setError("");
    try {
      const res = await mosyGetData({ endpoint, params: { start: form.start, end: form.end, channel: form.channel } });
      if (res?.status !== "success") throw new Error(res?.message || "Could not generate the report");
      setData(res.data);
      setOptions({ business: form.business, demo: form.demo, charts: form.charts, notes: form.notes });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // the browser uses the page title as the default PDF file name
  function print() {
    const old = document.title;
    document.title = `PAYTRACK_${data.merchant.replace(/\s+/g, "_")}_Owners_Report_${data.period.start}_to_${data.period.end}`;
    window.print();
    setTimeout(() => { document.title = old; }, 500);
  }

  const empty = data && !data.in.length && !data.out.length;

  return (
    <div className="or-wrap">
      <div className="or-screen-only">
        <h1 className="or-pagetitle">Owners Report</h1>
        <div className="or-pagesub">A plain-English report of money in, money out and charges, built from the imported statements.</div>
        <ReportControls form={form} setForm={setForm} channels={channels} onGenerate={generate} onPrint={print} loading={loading} canPrint={!!data && !empty} />
        {error && <div className="or-alert">{error}</div>}
        {empty && <div className="or-alert warn">No transactions found for that channel and period. Import the statements first, or widen the dates.</div>}
        {!data && !loading && <div className="or-hint">Choose a channel and period, then generate the report.</div>}
      </div>
      {data && !empty && options && <OwnersReport data={data} options={options} />}
    </div>
  );
}
