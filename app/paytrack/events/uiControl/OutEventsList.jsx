'use client';
import { OutEventsSchema } from '../OutEventsSchema';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';
import EventsActions from '../logicControl/actionsRegistry';

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthLabel(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// Same "sum what's currently loaded" convention as the Money In grid.
function modeTotalsStats(g) {
  const totals = {};
  (g.rows || []).forEach((r) => {
    const mode = r.payment_mode || 'Other';
    totals[mode] = (totals[mode] || 0) + (Number(r.amount) || 0);
  });
  const toneByMode = { 'M-Pesa': 'green', Cash: 'amber', Card: 'blue', Bank: 'purple' };
  return Object.entries(totals).map(([mode, total]) => ({
    key: mode,
    label: mode,
    value: money(total),
    icon: 'money',
    tone: toneByMode[mode] || 'teal',
  }));
}

function eventsBreakdowns(g) {
  const rows = g.rows || [];
  const sumBy = (keyFn) => {
    const totals = {};
    rows.forEach((r) => {
      const key = keyFn(r) || 'Unknown';
      totals[key] = (totals[key] || 0) + (Number(r.amount) || 0);
    });
    return Object.entries(totals).map(([label, value]) => ({ label, value, display: money(value) }));
  };

  return [
    {
      key: 'by_mode',
      title: 'By Payment Mode',
      type: 'column',
      centerLabel: 'Total',
      centerValue: money(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      items: sumBy((r) => r.payment_mode),
    },
    {
      key: 'by_branch',
      title: 'By Channel',
      type: 'donut',
      items: sumBy((r) => r.branch_name || r.branch_id),
    },
    {
      key: 'by_month',
      title: 'By Month',
      type: 'bars',
      items: sumBy((r) => monthLabel(r.occurred_at)),
    },
  ];
}

export default function OutEventsList({
  fixedQuery = { eventType: btoa('Money Out') },   // only Money Out events
  dataOut = {},
  title = OutEventsSchema.label,
  description = `${OutEventsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = EventsActions,
  schema = OutEventsSchema,
  hiddenActions = [],
  stats = modeTotalsStats,
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
