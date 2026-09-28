'use client';
import { ReconciliationsSchema } from '../ReconciliationsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import ReconciliationsActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function ReconciliationsList() {
//   return <SmartGrid moduleActions={ReconciliationsActions} schema={ReconciliationsSchema} title="Reconciliations" />;
// }PaidInvoicesSchema.label
export default function ReconciliationsList({
  fixedQuery = {},
  dataOut = {},
  title = ReconciliationsSchema.label,
  description = `${ReconciliationsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = ReconciliationsActions,
  schema = ReconciliationsSchema,
  hiddenActions=[],

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
    />
  );
}