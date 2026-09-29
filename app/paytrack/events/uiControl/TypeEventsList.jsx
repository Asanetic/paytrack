'use client';
import { TypeEventsSchema } from '../TypeEventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';

// Rows already come pre-grouped (period × branch × event_type) from the
// /events/type aggregate endpoint — `total`/`count` are already sums, so
// these just re-group what's currently loaded, same "sum what's on the
// page" convention used elsewhere (no separate aggregate call).
function sumRowsBy(rows, keyFn) {
  const totals = {};
  rows.forEach((r) => {
    const key = keyFn(r) || 'Unknown';
    if (!totals[key]) totals[key] = { total: 0, count: 0 };
    totals[key].total += Number(r.total) || 0;
    totals[key].count += Number(r.count) || 0;
  });
  return totals;
}

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const TYPE_TONES = { 'Money In': 'green', 'Money Out': 'red' };

function eventTypeStats(g) {
  const rows = g.rows || [];
  const byType = sumRowsBy(rows, (r) => r.event_type);
  const grand = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const grandCount = rows.reduce((s, r) => s + (Number(r.count) || 0), 0);

  return [
    { key: 'grand_total', label: 'Total', value: money(grand), sub: `${grandCount.toLocaleString()} events`, icon: 'bolt', tone: 'teal' },
    ...Object.entries(byType).map(([type, t]) => ({
      key: type,
      label: type,
      value: money(t.total),
      sub: `${t.count.toLocaleString()} event${t.count === 1 ? '' : 's'}`,
      icon: 'bolt',
      tone: TYPE_TONES[type] || 'blue',
    })),
  ];
}

function eventTypeBreakdowns(g) {
  const rows = g.rows || [];
  const toItems = (totals) => Object.entries(totals).map(([label, t]) => ({ label, value: t.total, display: money(t.total) }));

  return [
    {
      key: 'by_type',
      title: 'By Event Type',
      type: 'donut',
      centerLabel: 'Total',
      centerValue: money(rows.reduce((s, r) => s + (Number(r.total) || 0), 0)),
      items: toItems(sumRowsBy(rows, (r) => r.event_type)),
    },
    {
      key: 'by_branch',
      title: 'By Branch',
      type: 'bars',
      items: toItems(sumRowsBy(rows, (r) => r.branch_name)),
    },
    {
      key: 'by_period',
      title: 'By Date',
      type: 'bars',
      items: toItems(sumRowsBy(rows, (r) => r.period)),
    },
  ];
}

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function TypeEventsList() {
//   return <SmartGrid moduleActions={EventsActions} schema={TypeEventsSchema} title="Events" />;
// }PaidInvoicesSchema.label
export default function TypeEventsList({
  fixedQuery = {},
  dataOut = {},
  title = TypeEventsSchema.label,
  description = `${TypeEventsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = EventsActions,
  schema = TypeEventsSchema,
  hiddenActions=[],
  stats = eventTypeStats,
  breakdowns = eventTypeBreakdowns,

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
