'use client';
import { EventsSchema } from '../EventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';
import SmartGridPro from '../../moduleControl/UiControl/Smartgridpro';
import SmartGridInsight from '../../moduleControl/UiControl/SmartGridInsight';

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
    />
  );
}