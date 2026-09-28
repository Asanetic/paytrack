/**
 * Register real behavior here, once per action key. Both grid rowLinks
 * AND profile-level buttons (schema.profileActions) route through this
 * SAME registry — one place to add new behavior, works everywhere.
 *
 * Every registered function receives ONE ctx object instead of a fixed
 * list of positional args — see actionRegistryDocs.md (same folder) for
 * the full ctx field list and worked examples for every action shape
 * used elsewhere in this app (cross-module popups, preset create forms,
 * quick-edit modals, grid-toolbar smart filters, sending messages, etc).
 * Copy the block that matches what you're building from there.
 *
 * NOTE: "delete" and "clone" are intercepted directly by
 * useEntityFormController before they ever reach this registry — don't
 * register functions under those two keys, they will never fire.
 */

import { openSmartMapFilter, openSmartTagFilter, openSmartDateFilter } from "../../moduleControl/UiControl/smartFilterActions";
import { BranchesSchema } from "../../branches/BranchesSchema";

const PaymentsActions = {
  // Bound by gridOptions.checkFunction in schema.js. Fires with every row
  // the user ticked in the grid's checkbox column. Swap the display-name
  // fallback chain for whatever field this module's rows actually have.
  gridCheckBoxAction: async ({ rows }) => {
    const displayName = (row) => row?.title || row?.name || row?.record_id || 'record';
    alert(`${rows.length} record(s) selected: ${rows.map(displayName).join(', ')}`);
  },

  // Grid-toolbar smart filters — see actionRegistryDocs.md section 8.
  filter_by_branch: (ctx) => openSmartMapFilter(ctx, {
    title: 'Filter by branch',
    searchSchema: BranchesSchema,
    displayField: 'branch_name',
    valueField: 'record_id',
    localColumnKey: 'branch_id',
  }),

  filter_by_mode: (ctx) => openSmartTagFilter(ctx, {
    title: 'Filter by payment mode',
    columnKey: 'payment_mode',
  }),

  filter_by_date: (ctx) => openSmartDateFilter(ctx, {
    title: 'Filter by transaction date',
    columnKey: 'transaction_at',
    inputType: 'date',
  }),

  // Add more as needed — see actionRegistryDocs.md for patterns to copy.
  // Every one of them gets whatever's on ctx: { rows, schema, router,
  // refresh, create, update, remove, filter, setFilterValue,
  // setAdvancedQuery, setDateRange, applyFilter, clearFilterValue }.
};


export default PaymentsActions
