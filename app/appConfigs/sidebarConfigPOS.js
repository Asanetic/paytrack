// sidebarConfigPayTrack.js
//
// PayTrack
// PaymentOS — Phase 1
//
// Core concept:
//
// BUSINESS EVENT
//      ↓
// MONEY IN / MONEY OUT
//      ↓
// MONEY MOVEMENT
//      ↓
// RECONCILIATION
//      ↓
// REPORTING
//
// PayTrack is industry agnostic.
// It does not assume the business is a POS, restaurant,
// betting platform, hospital, real estate business, etc.
//
// Event types are configurable and can include:
// SALE
// EXPENSE
// BET_DEPOSIT
// BET_PAYOUT
// CUSTOMER_DEPOSIT
// RENT_PAYMENT
// PATIENT_PAYMENT
// REFUND
// SUPPLIER_PAYMENT
// COMMISSION
// etc.
//
// Direction is standardized:
// MONEY_IN
// MONEY_OUT
//
// The event type is dynamic.
//
// Phase 1 intentionally does NOT expose:
// - Bank settlement processing
// - Bank credit confirmation
// - Receivables / Payables
// - Supplier management
// - CDM settlement processing
//
// External sources such as POS, M-Pesa, CDM, Bank,
// Card processors, APIs and imports are treated as
// sources of events / money movements.
//

export const sidebarConfig = [

  // =========================================================
  // DASHBOARD
  // =========================================================

  {
    type: "link",
    label: "Dashboard",
    icon: "fa fa-dashboard",
    href: (routes) => `${routes.paytrack}/dashboard/main`,
    roles: []
  },


  // =========================================================
  // MONEY FLOW
  // =========================================================
  //
  // The central financial view.
  //
  // Money In  = money entering the business
  // Money Out = money leaving the business
  //
  // The underlying records remain generic money movements.
  //

  {
    type: "submenu",
    label: "Money Flow",
    icon: "fa fa-exchange",
    roles: [],
    items: [

      {
        label: "All Money",
        href: (routes) => `${routes.paytrack}/moneyflow/list`,
        roles: []
      },

      {
        label: "Money In",
        href: (routes) => `${routes.paytrack}/moneyflow/in`,
        roles: []
      },

      {
        label: "Money Out",
        href: (routes) => `${routes.paytrack}/events/list`,
        roles: []
      },

      {
        label: "By Payment Channel",
        href: (routes) => `${routes.paytrack}/moneyflow/bymethod`,
        roles: []
      },

      {
        label: "By Branch",
        href: (routes) => `${routes.paytrack}/moneyflow/bybranch`,
        roles: []
      },

      {
        label: "Daily Summary",
        href: (routes) => `${routes.paytrack}/moneyflow/daily`,
        roles: []
      }

    ]
  },


  // =========================================================
  // BUSINESS EVENTS
  // =========================================================
  //
  // Everything that happens in the business can be represented
  // as an event.
  //
  // Examples:
  //
  // SALE              → MONEY_IN
  // BET_DEPOSIT       → MONEY_IN
  // PATIENT_PAYMENT   → MONEY_IN
  // RENT_PAYMENT      → MONEY_IN
  //
  // EXPENSE           → MONEY_OUT
  // BET_PAYOUT        → MONEY_OUT
  // REFUND            → MONEY_OUT
  // SUPPLIER_PAYMENT  → MONEY_OUT
  //
  // PayTrack does not need to understand the industry.
  // The event type provides the business context.
  //

  {
    type: "submenu",
    label: "Business Events",
    icon: "fa fa-bolt",
    roles: [],
    items: [

      {
        label: "All Events",
        href: (routes) => `${routes.paytrack}/events/list`,
        roles: []
      },

      {
        label: "Money In Events",
        href: (routes) => `${routes.paytrack}/events/in`,
        roles: []
      },

      {
        label: "Money Out Events",
        href: (routes) => `${routes.paytrack}/events/out`,
        roles: []
      },

      {
        label: "Event Types",
        href: (routes) => `${routes.paytrack}/events/type`,
        roles: []
      }

    ]
  },


  // =========================================================
  // RECONCILIATION
  // =========================================================
  //
  // Reconciliation compares independent records of money
  // movement.
  //
  // Examples:
  //
  // Business Event
  //       +
  // M-Pesa Transaction
  //
  // Business Event
  //       +
  // Cash Collection Log
  //
  // Business Event
  //       +
  // CDM Machine Log
  //
  // Business Event
  //       +
  // POS Transaction
  //
  // Business Event
  //       +
  // Bank / Provider Record
  //
  // Phase 1 does not assume bank settlement.
  //

  // {
  //   type: "submenu",
  //   label: "Reconciliation",
  //   icon: "fa fa-link",
  //   roles: [],
  //   items: [

  //     {
  //       label: "Overview",
  //       href: (routes) => `${routes.paytrack}/reconciliation/overview`,
  //       roles: []
  //     },

  //     {
  //       label: "Matched",
  //       href: (routes) => `${routes.paytrack}/reconciliation/matched`,
  //       roles: []
  //     },

  //     {
  //       label: "Unmatched",
  //       href: (routes) => `${routes.paytrack}/reconciliation/unmatched`,
  //       roles: []
  //     },

  //     {
  //       label: "Amount Mismatches",
  //       href: (routes) => `${routes.paytrack}/reconciliation/mismatches`,
  //       roles: []
  //     },

  //     {
  //       label: "Duplicates",
  //       href: (routes) => `${routes.paytrack}/reconciliation/duplicates`,
  //       roles: []
  //     },

  //     {
  //       label: "Exceptions",
  //       href: (routes) => `${routes.paytrack}/reconciliation/exceptions`,
  //       roles: []
  //     }

  //   ]
  // },


  // =========================================================
  // CLIENTS
  // =========================================================
  //
  // Optional relationship attached to events and money
  // movements.
  //
  // The platform remains usable even when a transaction
  // has no customer attached.
  //

  {
    type: "submenu",
    label: "Clients",
    icon: "fa fa-users",
    roles: [],
    items: [

      {
        label: "All Clients",
        href: (routes) => `${routes.paytrack}/clients/list`,
        roles: []
      },

      {
        label: "New Client",
        href: (routes) => `${routes.paytrack}/clients/profile`,
        roles: []
      }

    ]
  },


  // =========================================================
  // REPORTS
  // =========================================================
  //
  // Reporting is based on the generic money/event model.
  //
  // The same reports work for:
  //
  // POS
  // Restaurant
  // Hospital
  // Betting
  // Real Estate
  // Retail
  // etc.
  //

  {
    type: "submenu",
    label: "Reports",
    icon: "fa fa-bar-chart",
    roles: [],
    items: [

      {
        label: "Daily Report",
        href: (routes) => `${routes.paytrack}/reports/daily`,
        roles: []
      },

      {
        label: "Monthly Report",
        href: (routes) => `${routes.paytrack}/reports/monthly`,
        roles: []
      },

      {
        label: "By Payment Channel",
        href: (routes) => `${routes.paytrack}/reports/bymethod`,
        roles: []
      },

      {
        label: "By Branch",
        href: (routes) => `${routes.paytrack}/reports/bybranch`,
        roles: []
      },

      {
        label: "Business Events",
        href: (routes) => `${routes.paytrack}/reports/events`,
        roles: []
      },

      {
        label: "Transaction Report",
        href: (routes) => `${routes.paytrack}/reports/transactions`,
        roles: []
      },

      // {
      //   label: "Reconciliation Report",
      //   href: (routes) => `${routes.paytrack}/reports/reconciliation`,
      //   roles: []
      // }

    ]
  },


  // =========================================================
  // SETTINGS
  // =========================================================
  //
  // Configuration of the PayTrack environment.
  //

  {
    type: "submenu",
    label: "Settings",
    icon: "fa fa-cogs",
    roles: [],
    items: [

      // -----------------------------------------------------
      // BRANCHES / LOCATIONS
      // -----------------------------------------------------

      {
        label: "Branches",
        href: (routes) => `${routes.paytrack}/branches/list`,
        roles: []
      },

      // -----------------------------------------------------
      // PAYMENT CHANNELS
      // -----------------------------------------------------
      //
      // M-Pesa
      // Airtel Money
      // Card
      // Cash
      // Bank
      // CDM
      // etc.
      //

      // {
      //   label: "Payment Channels",
      //   href: (routes) => `${routes.paytrack}/paymentmethods/list`,
      //   roles: []
      // },

      // -----------------------------------------------------
      // EVENT TYPES
      // -----------------------------------------------------
      //
      // Customer-defined business events.
      //
      // Examples:
      // SALE
      // EXPENSE
      // BET_DEPOSIT
      // BET_PAYOUT
      // RENT_PAYMENT
      // PATIENT_PAYMENT
      // REFUND
      // etc.
      //

      // {
      //   label: "Event Types",
      //   href: (routes) => `${routes.paytrack}/events/type`,
      //   roles: []
      // },

      // -----------------------------------------------------
      // INTEGRATIONS
      // -----------------------------------------------------
      //
      // POS
      // ERP
      // M-Pesa
      // Banks
      // CDM
      // APIs
      // Imports
      // Other external systems
      //

      // {
      //   label: "Integrations",
      //   href: (routes) => `${routes.paytrack}/integrations/list`,
      //   roles: []
      // },

      // -----------------------------------------------------
      // USERS
      // -----------------------------------------------------

      {
        label: "Users",
        href: (routes) => `${routes.paytrack}/users/list`,
        roles: []
      },

      // -----------------------------------------------------
      // SYSTEM SETTINGS
      // -----------------------------------------------------

      // {
      //   label: "System Settings",
      //   href: (routes) => `${routes.paytrack}/settings`,
      //   roles: []
      // }

    ]
  }

];