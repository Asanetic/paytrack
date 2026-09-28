'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import mosyThemeConfigs from '../../appConfigs/mosyTheme';
import './TransactionFeed.css';

// ════════════════════════════════════════════════════════════════
// TransactionFeed — presentation only. Data in via props, every
// interaction out via callbacks. No fetching, no router.
//
//   <TransactionFeed
//     title / subtitle
//     sources={[...]}  activeSource  onSourceChange(key)
//     search  onSearchChange(text)  onSearchSubmit(text)
//     items={[...]}    cardActions={[...]}  menuActions={[...]}
//     filters={[...]}  onFilterChange(key, value, allValues)  onResetFilters()
//     summary={{...}}  methods={{...}}  tip={{...}}
//     loading  hasMore  onLoadMore()
//   />
//
// See TransactionFeed.sample.jsx for every shape.
// tone: blue | green | purple | amber | red | teal | gray
// ════════════════════════════════════════════════════════════════

const STATUS_TONES = {
  matched: 'green', completed: 'green', reconciled: 'green', paid: 'green',
  waiting: 'amber', pending: 'amber', processing: 'amber', partial: 'amber',
  failed: 'red', unmatched: 'red', mismatch: 'red', missing: 'red', reversed: 'red',
  duplicate: 'purple',
};
const toneFor = (status, override) => override || STATUS_TONES[String(status || '').toLowerCase()] || 'gray';

// Source avatar: real logo image if given, else a FA icon on a tone bubble.
function Avatar({ logo, icon, tone = 'blue', size = 'md', solid = false, label }) {
  if (logo) {
    return (
      <span className={`tf-avatar tf-avatar-${size} tf-avatar-img`}>
        <img src={logo} alt={label || ''} />
      </span>
    );
  }
  return (
    <span className={`tf-avatar tf-avatar-${size} ${solid ? `tf-solid-${tone}` : `tf-tone-${tone}`}`}>
      <i className={`fa fa-${icon || 'money'}`}></i>
    </span>
  );
}

function ViewAll({ onClick, href, label = 'View all' }) {
  if (!onClick && !href) return null;
  return href ? (
    <a className="tf-link" href={href}>{label}</a>
  ) : (
    <button type="button" className="tf-link" onClick={onClick}>{label}</button>
  );
}

// ── Source tabs ─────────────────────────────────────────────────
function SourceTabs({ sources, active, onChange }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="tf-sources" role="tablist">
      {sources.map((s) => {
        const isActive = s.key === active;
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`tf-source ${isActive ? 'is-active' : ''} ${s.key === 'all' ? 'is-all' : ''}`}
            onClick={() => onChange?.(s.key)}
          >
            {s.key === 'all' ? (
              <>
                <span className="tf-source-all-icon"><i className={`fa fa-${s.icon || 'th-large'}`}></i></span>
                <span>{s.label || 'All'}</span>
              </>
            ) : (
              <>
                <Avatar logo={s.logo} icon={s.icon} tone={s.tone} size="sm" label={s.label} />
                <span className="tf-source-label">{s.label}</span>
              </>
            )}
            {s.count !== undefined && <span className="tf-source-count">{s.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ── "…" menu per card ───────────────────────────────────────────
function CardMenu({ actions, item }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const list = (actions || []).filter((a) => !a.hidden?.(item));
  if (list.length === 0) return null;

  return (
    <div className="tf-menu" ref={ref}>
      <button type="button" className="tf-icon-btn" onClick={() => setOpen((o) => !o)} aria-label="More actions" aria-expanded={open}>
        <i className="fa fa-ellipsis-h"></i>
      </button>
      {open && (
        <div className="tf-menu-panel">
          {list.map((a) => (
            <button
              key={a.key}
              type="button"
              className={`tf-menu-item ${a.danger ? 'is-danger' : ''}`}
              onClick={() => {
                setOpen(false);
                a.onClick?.(item);
              }}
            >
              {a.icon && <i className={`fa fa-${a.icon}`}></i>}
              <span>{a.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Feed card ───────────────────────────────────────────────────
function FeedCard({ item, cardActions, menuActions, onOpen }) {
  const actions = (item.actions || cardActions || []).filter((a) => !a.hidden?.(item));
  const clickable = !!onOpen;

  return (
    <article className="tf-card tf-feed-card">
      <header className="tf-feed-head">
        <Avatar logo={item.logo} icon={item.icon} tone={item.tone} size="lg" solid label={item.source} />
        <div className="tf-feed-who">
          <div className="tf-feed-source">{item.source}</div>
          {item.time && <div className="tf-feed-time">{item.time}</div>}
        </div>
        {item.status && <span className={`tf-pill tf-soft-${toneFor(item.status, item.statusTone)}`}>{item.status}</span>}
        <CardMenu actions={menuActions} item={item} />
      </header>

      {item.image && (
        <div
          className={`tf-feed-media ${clickable ? 'is-clickable' : ''}`}
          onClick={clickable ? () => onOpen(item) : undefined}
        >
          <img src={item.image} alt={item.imageAlt || item.title || ''} loading="lazy" />
        </div>
      )}

      <div className="tf-feed-body">
        {clickable ? (
          <button type="button" className="tf-feed-title tf-feed-title-btn" onClick={() => onOpen(item)}>
            {item.title}
          </button>
        ) : (
          <h3 className="tf-feed-title">{item.title}</h3>
        )}
        {(item.meta || []).map((m, i) => (
          <div key={i} className="tf-feed-meta">
            {m.label && <span>{m.label}: </span>}
            <span className="tf-feed-meta-value">{m.value}</span>
          </div>
        ))}
      </div>

      {actions.length > 0 && (
        <footer className="tf-feed-actions" style={{ '--tf-action-count': actions.length }}>
          {actions.map((a) => (
            <button key={a.key} type="button" className="tf-btn" onClick={() => a.onClick?.(item)}>
              {a.icon && <i className={`fa fa-${a.icon}`}></i>}
              <span>{a.label}</span>
            </button>
          ))}
        </footer>
      )}
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="tf-card tf-feed-card tf-skeleton" aria-hidden="true">
      <div className="tf-feed-head">
        <span className="tf-sk tf-sk-circle"></span>
        <div style={{ flex: 1 }}>
          <span className="tf-sk tf-sk-line" style={{ width: '35%' }}></span>
          <span className="tf-sk tf-sk-line" style={{ width: '20%' }}></span>
        </div>
      </div>
      <span className="tf-sk tf-sk-media"></span>
      <span className="tf-sk tf-sk-line" style={{ width: '60%', height: 16 }}></span>
      <span className="tf-sk tf-sk-line" style={{ width: '30%' }}></span>
    </div>
  );
}

// ── Sidebar ─────────────────────────────────────────────────────
function FilterPanel({ filters, onChange, onReset, title = 'Filter feed' }) {
  const initial = () => Object.fromEntries((filters || []).map((f) => [f.key, f.value ?? f.options?.[0]?.value ?? '']));
  const [values, setValues] = useState(initial);

  // keep in sync if the parent resets/changes values
  const filtersKey = JSON.stringify((filters || []).map((f) => [f.key, f.value]));
  useEffect(() => setValues(initial()), [filtersKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!filters || filters.length === 0) return null;

  const set = (key, val) => {
    const next = { ...values, [key]: val };
    setValues(next);
    onChange?.(key, val, next);
  };

  return (
    <section className="tf-card tf-side-card">
      <div className="tf-side-head">
        <h4 className="tf-side-title">{title}</h4>
        {onReset && (
          <button type="button" className="tf-link" onClick={() => { setValues(Object.fromEntries(filters.map((f) => [f.key, f.options?.[0]?.value ?? '']))); onReset(); }}>
            Reset
          </button>
        )}
      </div>
      <div className="tf-filter-list">
        {filters.map((f) => {
          const first = f.options?.[0]?.value ?? '';
          const isSet = values[f.key] !== first && values[f.key] !== '';
          return (
            <label key={f.key} className={`tf-select-wrap ${isSet ? 'is-set' : ''}`}>
              {f.icon && <i className={`fa fa-${f.icon} tf-select-icon`}></i>}
              {f.type === 'date' ? (
                <input type="date" className="tf-select" aria-label={f.label} value={values[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} />
              ) : (
                <select className="tf-select" aria-label={f.label} value={values[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                  {(f.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              )}
            </label>
          );
        })}
      </div>
    </section>
  );
}

function SummaryCard({ summary }) {
  if (!summary) return null;
  const up = typeof summary.change === 'string' ? !summary.change.trim().startsWith('-') : Number(summary.change) >= 0;
  return (
    <section className="tf-card tf-side-card">
      <div className="tf-side-head">
        <h4 className="tf-side-title">{summary.title || "Today's summary"}</h4>
        <ViewAll onClick={summary.onViewAll} href={summary.viewAllHref} />
      </div>
      <div className="tf-summary-amount">{summary.amount}</div>
      {summary.change !== undefined && summary.change !== null && (
        <div className="tf-summary-change">
          <span className={`tf-chip ${up ? 'tf-chip-up' : 'tf-chip-down'}`}>
            <i className={`fa fa-arrow-${up ? 'up' : 'down'}`}></i> {String(summary.change).replace(/^[-+]/, '')}
          </span>
          <span className="tf-muted">{summary.changeLabel || 'vs yesterday'}</span>
        </div>
      )}
    </section>
  );
}

function MethodsCard({ methods }) {
  if (!methods || !(methods.items || []).length) return null;
  return (
    <section className="tf-card tf-side-card">
      <div className="tf-side-head">
        <h4 className="tf-side-title">{methods.title || 'By payment method'}</h4>
        <ViewAll onClick={methods.onViewAll} href={methods.viewAllHref} />
      </div>
      <ul className="tf-method-list">
        {methods.items.map((m) => {
          const Tag = m.onClick ? 'button' : 'div';
          return (
            <li key={m.key || m.label}>
              <Tag type={m.onClick ? 'button' : undefined} className={`tf-method ${m.onClick ? 'is-clickable' : ''}`} onClick={m.onClick}>
                <Avatar logo={m.logo} icon={m.icon} tone={m.tone} size="md" label={m.label} />
                <span className="tf-method-label">{m.label}</span>
                <span className="tf-method-right">
                  <strong>{m.amount}</strong>
                  {m.count !== undefined && <span className="tf-muted">{Number(m.count).toLocaleString()} {m.countLabel || 'payments'}</span>}
                </span>
              </Tag>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TipCard({ tip }) {
  const [hidden, setHidden] = useState(false);
  if (!tip || hidden) return null;
  return (
    <section className="tf-tip">
      <i className={`fa fa-${tip.icon || 'lightbulb-o'} tf-tip-icon`}></i>
      <div className="tf-tip-body">
        <div className="tf-tip-title">{tip.title || 'Tip'}</div>
        <div className="tf-tip-text">{tip.text}</div>
      </div>
      {tip.dismissible !== false && (
        <button type="button" className="tf-icon-btn tf-tip-close" aria-label="Dismiss tip" onClick={() => { setHidden(true); tip.onDismiss?.(); }}>
          <i className="fa fa-times"></i>
        </button>
      )}
    </section>
  );
}

// ── Main ────────────────────────────────────────────────────────
export default function TransactionFeed({
  title = 'Transaction Feed',
  subtitle = 'Live view of sales and payments as they happen.',
  headerRight,               // optional node (e.g. date/branch pickers)

  sources,
  activeSource = 'all',
  onSourceChange,

  search = '',
  onSearchChange,
  onSearchSubmit,
  searchPlaceholder = 'Search transactions...',

  items = [],
  cardActions,
  menuActions,
  onOpenItem,
  emptyText = 'No transactions match these filters.',

  filters,
  onFilterChange,
  onResetFilters,
  summary,
  methods,
  tip,

  loading = false,
  hasMore = false,
  onLoadMore,
  loadMoreLabel = 'Load more',
}) {
  const themeVars = useMemo(
    () => ({
      '--tf-accent': mosyThemeConfigs.btnBg,
      '--tf-accent-contrast': mosyThemeConfigs.btnTxt,
      '--tf-accent-dark': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 85%, #000000)`,
      '--tf-accent-soft': `color-mix(in srgb, ${mosyThemeConfigs.btnBg} 10%, transparent)`,
    }),
    []
  );

  // search is controlled if onSearchChange is given, local otherwise
  const [localSearch, setLocalSearch] = useState(search);
  const searchValue = onSearchChange ? search : localSearch;
  const setSearch = (v) => (onSearchChange ? onSearchChange(v) : setLocalSearch(v));

  const hasSidebar = !!(filters?.length || summary || methods || tip);
  const firstLoad = loading && items.length === 0;

  return (
    <div className="tf-root" style={themeVars}>
      <div className="tf-header">
        <div>
          <h1 className="tf-title">{title}</h1>
          {subtitle && <p className="tf-subtitle">{subtitle}</p>}
        </div>
        {headerRight && <div className="tf-header-right">{headerRight}</div>}
      </div>

      <div className={`tf-layout ${hasSidebar ? 'has-sidebar' : ''}`}>
        {/* top strip spans both columns: sources + search */}
        <div className="tf-topbar">
          <SourceTabs sources={sources} active={activeSource} onChange={onSourceChange} />
          <div className="tf-search">
            <i className="fa fa-search tf-search-icon"></i>
            <input
              type="text"
              className="tf-search-input"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSearchSubmit?.(searchValue)}
            />
            {searchValue && (
              <button type="button" className="tf-search-clear" aria-label="Clear search" onClick={() => { setSearch(''); onSearchSubmit?.(''); }}>
                <i className="fa fa-times"></i>
              </button>
            )}
          </div>
        </div>

        <main className="tf-feed">
          {firstLoad ? (
            <>
              <SkeletonCard />
              <SkeletonCard />
            </>
          ) : items.length === 0 ? (
            <div className="tf-card tf-empty">
              <i className="fa fa-inbox"></i>
              <div>{emptyText}</div>
            </div>
          ) : (
            items.map((it, i) => (
              <FeedCard key={it.key ?? it.id ?? i} item={it} cardActions={cardActions} menuActions={menuActions} onOpen={onOpenItem} />
            ))
          )}

          {!firstLoad && hasMore && onLoadMore && (
            <button type="button" className="tf-btn tf-load-more" onClick={onLoadMore} disabled={loading}>
              {loading ? <><span className="tf-spinner"></span> Loading...</> : loadMoreLabel}
            </button>
          )}
        </main>

        {hasSidebar && (
          <aside className="tf-sidebar">
            <FilterPanel filters={filters} onChange={onFilterChange} onReset={onResetFilters} />
            <SummaryCard summary={summary} />
            <MethodsCard methods={methods} />
            <TipCard tip={tip} />
          </aside>
        )}
      </div>
    </div>
  );
}
