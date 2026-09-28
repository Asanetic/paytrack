'use client';
import { TypeEventsSchema } from '../TypeEventsSchema';
import SmartGrid from '../../moduleControl/UiControl/SmartGrid';
import EventsActions from '../logicControl/actionsRegistry';

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