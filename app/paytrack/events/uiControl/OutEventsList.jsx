'use client';
import { OutEventsSchema } from '../OutEventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';

// Thin wrapper only — all real grid logic lives in components/EntityGrid.jsx
// export default function OutEventsList() {
//   return <SmartGrid moduleActions={EventsActions} schema={OutEventsSchema} title="Events" />;
// }PaidInvoicesSchema.label
export default function OutEventsList({
  fixedQuery = {},
  dataOut = {},
  title = OutEventsSchema.label,
  description = `${OutEventsSchema.label} list`,
  customProfilePath = './profile',
  moduleActions = EventsActions,
  schema = OutEventsSchema,
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