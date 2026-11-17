import React from "react";
import logo from "../../../img/logo/logo.png";
import { Page, H1, H2, P, Cards, DataTable } from "./ReportParts";
import { Donut, Bars } from "./Charts";
import { buildReport } from "./reportText";

// Table on the left, chart on the right (keeps each sheet on one page); just the table when charts are off.
const Split = ({ charts, chart, children }) => (charts && chart ? <div className="or-split"><div>{children}</div>{chart}</div> : children);

// The five-page Owners Report. All wording comes from reportText.js, all figures from the API.
export default function OwnersReport({ data, options }) {
  const r = buildReport(data, options);
  const biz = r.biz;
  const f = r.footer;
  const c = !!options.charts;

  return (
    <div className="or-report">
      {/* ---------------- page 1 ---------------- */}
      <Page n={1} footer={f}>
        <img className="or-logo" src={logo.src} alt="PAYTRACK" />
        <h1 className="or-title">{r.title}</h1>
        <div className="or-sub">{r.subtitle}</div>
        <P>{r.intro}</P>
        <Cards items={r.cards} />

        <H1>The short version</H1>
        {r.shortVersion.map((t, i) => <P key={i}>{t}</P>)}
        <div className="or-callout">{r.important}</div>

        <H1>What we looked at</H1>
        <DataTable headers={r.looked.headers} rows={r.looked.rows} wide />
        <P>{r.periodNote}</P>
        {r.notes && <><H2>Notes</H2><P>{r.notes}</P></>}
      </Page>

      {/* ---------------- page 2 ---------------- */}
      <Page n={2} footer={f}>
        <H1>1. MONEY THAT CAME IN</H1>
        <P>This is the money customers paid to the {biz} in the records we received.</P>
        <Split charts={c} chart={<Donut title="Where customers paid" items={r.chartIn} />}>
          <DataTable headers={r.moneyIn.headers} rows={r.moneyIn.rows} total={r.moneyIn.total} />
        </Split>

        <H2>What this tells us</H2>
        {r.tells.map((t, i) => <P key={i}>{t}</P>)}

        {r.sources && (
          <>
            <H2>Where the money came from</H2>
            <Split charts={c} chart={<Donut title="Money in by category" items={r.chartSources} />}>
              <DataTable headers={r.sources.headers} rows={r.sources.rows} total={r.sources.total} />
            </Split>
          </>
        )}

        {r.card && (
          <>
            <H2>Card payments</H2>
            <DataTable headers={r.card.headers} rows={r.card.rows} total={r.card.total} />
            <P>{r.simple}</P>
          </>
        )}
        {!r.card && <P>{r.simple}</P>}
      </Page>

      {/* ---------------- page 3 ---------------- */}
      <Page n={3} footer={f}>
        <H1>2. MONEY THAT WENT OUT</H1>
        {r.hasOut ? (
          <>
            <P>{r.outIntro}</P>
            <Split charts={c} chart={<Donut title="Where the money went" items={r.chartOut} />}>
              <DataTable headers={r.moneyOut.headers} rows={r.moneyOut.rows} total={r.moneyOut.total} />
            </Split>
            <H2>Who or what received the money?</H2>
            {r.whoReceived.map((t, i) => <P key={i}>{t}</P>)}
          </>
        ) : (
          <P>No money paid out was recorded in these records.</P>
        )}

        <H1>3. WHAT THE PAYMENT SERVICES CHARGED</H1>
        {r.charges.rows.length ? <DataTable headers={r.charges.headers} rows={r.charges.rows} total={r.charges.total} /> : <P>No transaction charges were recorded.</P>}
        {r.chargesNote.map((t, i) => <P key={i}>{t}</P>)}
      </Page>

      {/* ---------------- page 4 ---------------- */}
      <Page n={4} footer={f}>
        <H1>4. SO, HOW MUCH IS LEFT?</H1>
        {r.left.map((t, i) => <P key={i}>{t}</P>)}
        {c && <Bars title="From money received to the calculated difference" items={r.chartLeft} />}
        {r.account && (<><H2>{r.account.title}</H2><P>{r.account.text}</P></>)}

        <H1>5. THINGS WE FOUND THAT NEED A QUICK CHECK</H1>
        <DataTable headers={["What needs checking", "Why it matters"]} rows={r.checks} wide />

        <H2>What we could check from the files</H2>
        <P>{r.couldCheck}</P>
      </Page>

      {/* ---------------- page 5 ---------------- */}
      <Page n={5} footer={f}>
        <H1>6. WHAT WE RECOMMEND NEXT</H1>
        <P>To give the owner a clearer picture, we recommend getting four more pieces of information:</P>
        <ol className="or-list">{r.recommend.map((t, i) => <li key={i}>{t}</li>)}</ol>

        <H2>A few simple definitions</H2>
        <DataTable headers={["Word used in this report", "What it means"]} rows={r.definitions} wide />

        <H2>PLEASE NOTE</H2>
        <P>{r.pleaseNote}</P>
        <div className="or-tagline">{r.tagline}</div>
      </Page>
    </div>
  );
}
