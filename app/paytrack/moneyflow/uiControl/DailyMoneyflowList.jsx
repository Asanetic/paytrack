'use client';
import { DailyMoneyflowSchema } from '../DailyMoneyflowSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MoneyflowActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';

// Amount, totalled per payment mode, from the currently loaded page of
// rows — same "sum what's loaded" convention as PaymentsList's stats
// (and the grid's own column totals via schema field `sum: true`).
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

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function DailyMoneyflowList() {
//   return <SmartGrid moduleActions={MoneyflowActions} schema={DailyMoneyflowSchema} title="Moneyflow" />;
// }PaidInvoicesSchema.label
export default function DailyMoneyflowList({
  fixedQuery = {},
  dataOut = {},
  title = DailyMoneyflowSchema.label,
  description = `${DailyMoneyflowSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = MoneyflowActions,
  schema = DailyMoneyflowSchema,
  hiddenActions=[],
  stats = modeTotalsStats,

}) {
  return (
    <SmartGridPro
      moduleActions={moduleActions}
      schema={schema}
      title={title}
      description={description}
      customProfilePath={customProfilePath}
      fixedQuery={fixedQuery}
      dataOut={dataOut}
      hiddenActions={hiddenActions}
      stats={stats}
    />
  );
}
