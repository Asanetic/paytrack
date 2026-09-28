'use client';
import { BranchesSchema } from '../BranchesSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import BranchesActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function BranchesList() {
//   return <SmartGrid moduleActions={BranchesActions} schema={BranchesSchema} title="Branches" />;
// }PaidInvoicesSchema.label
export default function BranchesList({
  fixedQuery = {},
  dataOut = {},
  title = BranchesSchema.label,
  description = `${BranchesSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = BranchesActions,
  schema = BranchesSchema,
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