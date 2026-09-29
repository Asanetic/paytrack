'use client';
import { EventsSchema } from '../EventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';

// Counts, grouped by a field, from whatever page of rows is currently
// loaded — same "sum what's loaded" convention used elsewhere (no
// separate aggregate endpoint for this table).
function countBy(rows, key) {
  const totals = {};
  rows.forEach((r) => {
    const label = r[key] || 'Unspecified';
    totals[label] = (totals[label] || 0) + 1;
  });
  return Object.entries(totals).map(([label, value]) => ({ label, value, display: String(value) }));
}

function eventsBreakdowns(g) {
  const rows = g.rows || [];
  return [
    { key: 'by_type', title: 'By Event Type', type: 'donut', items: countBy(rows, 'event_type') },
    { key: 'by_mode', title: 'By Payment Mode', type: 'bars', items: countBy(rows, 'payment_mode') },
    { key: 'by_remark', title: 'By Event Remark', type: 'bars', items: countBy(rows, 'event_remark') },
  ];
}

const TYPE_ICONS = { 'money in': 'arrow-down', 'money out': 'arrow-up' };
const TYPE_TONES = ['blue', 'green', 'purple', 'amber', 'red', 'teal'];

// One KPI card per event_type — amount summed (the headline value) plus
// the event count — from whatever page of rows is currently loaded, same
// convention the breakdowns above use.
function eventTypeStats(g) {
  const totals = {};
  (g.rows || []).forEach((r) => {
    const label = r.event_type || 'Unspecified';
    if (!totals[label]) totals[label] = { count: 0, amount: 0 };
    totals[label].count += 1;
    totals[label].amount += Number(r.amount) || 0;
  });

  return Object.entries(totals).map(([label, t], i) => ({
    key: label,
    label,
    value: t.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    sub: `${t.count.toLocaleString()} event${t.count === 1 ? '' : 's'}`,
    icon: TYPE_ICONS[String(label).toLowerCase()] || 'bolt',
    tone: TYPE_TONES[i % TYPE_TONES.length],
  }));
}

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function EventsList() {
//   return <SmartGrid moduleActions={EventsActions} schema={EventsSchema} title="Events" />;
// }PaidInvoicesSchema.label
export default function EventsList({
  fixedQuery = {},
  dataOut = {},
  title = EventsSchema.label,
  description = `${EventsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = EventsActions,
  schema = EventsSchema,
  hiddenActions=[],
  stats = eventTypeStats,
  breakdowns = eventsBreakdowns,

}) {
  return (
    <SmartGridInsight
      moduleActions={moduleActions}
      schema={schema}
      title={title}
      description={description}
      customProfilePath={customProfilePath}
      fixedQuery={fixedQuery}
      dataOut={dataOut}
      hiddenActions={hiddenActions}
      stats={stats}
      breakdowns={breakdowns}
    />
  );
}
