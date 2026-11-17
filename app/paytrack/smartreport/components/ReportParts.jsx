import React from "react";

// One A4 sheet with the running footer ("PAYTRACK • NAME ... Page N")
export function Page({ n, footer, children }) {
  return (
    <section className="or-page">
      <div className="or-body">{children}</div>
      <footer className="or-foot"><span>{footer}</span><span>Page {n}</span></footer>
    </section>
  );
}

export const H1 = ({ children }) => <h2 className="or-h1">{children}</h2>;
export const H2 = ({ children }) => <h3 className="or-h2">{children}</h3>;
export const P = ({ children, className = "" }) => (children ? <p className={`or-p ${className}`}>{children}</p> : null);

export function Cards({ items }) {
  return (
    <div className="or-cards">
      {items.map((c) => (
        <div className="or-card" key={c.label}>
          <div className="or-card-l">{c.label}</div>
          <div className="or-card-v">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

// rows = array of arrays; every column after the first is right-aligned (counts and money)
export function DataTable({ headers, rows, total, wide }) {
  const cell = (v, i, tag) => React.createElement(tag, { key: i, className: i > 0 && !wide ? "num" : "" }, v);
  return (
    <table className="or-table">
      <thead><tr>{headers.map((h, i) => cell(h, i, "th"))}</tr></thead>
      <tbody>
        {rows.map((r, ri) => <tr key={ri}>{r.map((v, i) => cell(v, i, "td"))}</tr>)}
        {total && <tr className="or-total">{total.map((v, i) => cell(v, i, "td"))}</tr>}
      </tbody>
    </table>
  );
}
