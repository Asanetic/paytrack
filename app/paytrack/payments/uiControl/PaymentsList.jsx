'use client';
import { PaymentsSchema } from '../PaymentsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import PaymentsActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';

// Amount paid, totalled per payment mode, from the currently loaded
// page of rows — same "sum what's loaded" convention the grid's own
// column totals (schema field `sum: true`) already use.
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
    value: total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    icon: 'money',
    tone: toneByMode[mode] || 'teal',
  }));
}

const money = (n) => Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function monthLabel(dateStr) {
  const d = dateStr ? new Date(dateStr) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}

// Same "sum what's currently loaded" convention as modeTotalsStats above —
// grouped totals of `amount`, by mode / branch / month.
function paymentsBreakdowns(g) {
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
      type: 'donut',
      centerLabel: 'Total',
      centerValue: money(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
      items: sumBy((r) => r.payment_mode),
    },
    {
      key: 'by_branch',
      title: 'By Branch',
      type: 'bars',
      items: sumBy((r) => r._branch_name_branch_id || r.branch_id),
    },
    {
      key: 'by_month',
      title: 'By Month',
      type: 'bars',
      items: sumBy((r) => monthLabel(r.transaction_at)),
    },
  ];
}

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function PaymentsList() {
//   return <SmartGrid moduleActions={PaymentsActions} schema={PaymentsSchema} title="Payments" />;
// }PaidInvoicesSchema.label
export default function PaymentsList({
  fixedQuery = {},
  dataOut = {},
  title = PaymentsSchema.label,
  description = `${PaymentsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = PaymentsActions,
  schema = PaymentsSchema,
  hiddenActions=[],
  stats = modeTotalsStats,
  breakdowns = paymentsBreakdowns,

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
      // breakdowns={breakdowns}
    />
  );
}
