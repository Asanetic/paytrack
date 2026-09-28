'use client';
import { DailyMoneyflowSchema } from '../DailyMoneyflowSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import MoneyflowActions from '../logicControl/actionsRegistry';

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

}) {
  return (
    <SmartGrid
      moduleActions={moduleActions}
      schema={schema}
      title={title}
      description={description}
      customProfilePath={customProfilePath}
      fixedQuery={fixedQuery}
      dataOut={dataOut}
      hiddenActions={hiddenActions}
    />
  );
}