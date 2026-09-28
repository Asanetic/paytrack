'use client';
import { InEventsSchema } from '../InEventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function InEventsList() {
//   return <SmartGrid moduleActions={EventsActions} schema={InEventsSchema} title="Events" />;
// }PaidInvoicesSchema.label
export default function InEventsList({
  fixedQuery = {},
  dataOut = {},
  title = InEventsSchema.label,
  description = `${InEventsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = EventsActions,
  schema = InEventsSchema,
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