'use client';
// Example page wiring for TransactionFeed. Swap the static arrays for
// your API/hook results — the shapes below are all the component needs.
import { useMemo, useState } from 'react';
import TransactionFeed from './TransactionFeed';

// Put real images in /public/feed/... (or any URL). Omit `image` and
// the card simply renders without the banner.
const SAMPLE_ITEMS = [
  {
    key: 'MPESA3RT6K2P9', method: 'mpesa',
    source: 'M-pesa Monitor', time: '3 minutes ago', icon: 'mobile', tone: 'green',
    status: 'Matched', image: '/feed/mpesa.jpg',
    title: 'KES 1,000 received from Jeremiah Otieno',
    meta: [{ label: 'Sales Ref', value: 'INV-92811' }, { label: 'Transaction No', value: '#MPESA3RT6K2P9' }],
  },
  {
    key: 'CARD784512', method: 'card',
    source: 'Card Terminal', time: '12 minutes ago', icon: 'credit-card', tone: 'blue',
    status: 'Matched', image: '/feed/card.jpg',
    title: 'KES 12,500 received from Walk-in Customer',
    meta: [{ label: 'Sales Ref', value: 'INV-92810' }, { label: 'Transaction No', value: '#CARD784512' }],
  },
  {
    key: 'BKTRANSFER99321', method: 'bank',
    source: 'Bank Transfer', time: '28 minutes ago', icon: 'university', tone: 'purple',
    status: 'Matched', image: '/feed/bank.jpg',
    title: 'KES 6,700 received from KCB Bank',
    meta: [{ label: 'Sales Ref', value: 'INV-92809' }, { label: 'Transaction No', value: '#BKTRANSFER99321' }],
  },
  {
    key: 'CASH-001293', method: 'cash',
    source: 'POS Cash', time: '45 minutes ago', icon: 'money', tone: 'amber',
    status: 'Waiting', image: '/feed/cash.jpg',
    title: 'KES 2,300 received (Cash)',
    meta: [{ label: 'Sales Ref', value: 'INV-92808' }, { label: 'Transaction No', value: '#CASH-001293' }],
  },
];

const opts = (first, rest) => [{ value: '', label: first }, ...rest.map(([value, label]) => ({ value, label }))];

export default function TransactionFeedPage() {
  const [source, setSource] = useState('all');
  const [search, setSearch] = useState('');

  // Client-side filtering just for the demo — in production send
  // source/search/filters to the API and render whatever comes back.
  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return SAMPLE_ITEMS.filter(
      (it) =>
        (source === 'all' || it.method === source) &&
        (!q || JSON.stringify(it).toLowerCase().includes(q))
    );
  }, [source, search]);

  return (
    <TransactionFeed
      sources={[
        { key: 'all', label: 'All' },
        { key: 'mpesa', label: 'M-Pesa', icon: 'mobile', tone: 'green' },
        { key: 'card', label: 'Card', icon: 'credit-card', tone: 'blue' },
        { key: 'bank', label: 'Bank Transfer', icon: 'university', tone: 'purple' },
        { key: 'cash', label: 'Cash', icon: 'money', tone: 'amber' },
        // real brand logos: drop the file in /public and pass `logo`
        { key: 'airtel', label: 'Airtel Money', icon: 'mobile', tone: 'red' /* , logo: '/logos/airtel.png' */ },
        { key: 'equity', label: 'Equity', icon: 'university', tone: 'red' /* , logo: '/logos/equity.png' */ },
        { key: 'kcb', label: 'KCB', icon: 'university', tone: 'green' /* , logo: '/logos/kcb.png' */ },
      ]}
      activeSource={source}
      onSourceChange={setSource}
      search={search}
      onSearchChange={setSearch}
      onSearchSubmit={(q) => console.log('search', q)}
      items={items}
      onOpenItem={(it) => console.log('open', it.key)}
      cardActions={[
        { key: 'receipt', label: 'Receipt', icon: 'file-text-o', onClick: (it) => console.log('receipt', it.key) },
        { key: 'similar', label: 'Similar', icon: 'search', onClick: (it) => setSearch(it.meta?.[0]?.value || '') },
        { key: 'date', label: 'This date', icon: 'calendar', onClick: (it) => console.log('same date as', it.key) },
      ]}
      menuActions={[
        { key: 'view', label: 'View payment', icon: 'eye', onClick: (it) => console.log('view', it.key) },
        { key: 'match', label: 'Match manually', icon: 'link', hidden: (it) => it.status === 'Matched', onClick: (it) => console.log('match', it.key) },
        { key: 'copy', label: 'Copy transaction no.', icon: 'copy', onClick: (it) => navigator.clipboard?.writeText(it.key) },
        { key: 'flag', label: 'Flag as issue', icon: 'flag', danger: true, onClick: (it) => console.log('flag', it.key) },
      ]}
      filters={[
        { key: 'date', label: 'Date', icon: 'calendar', type: 'date', value: '2026-09-27' },
        { key: 'branch', label: 'Branch', icon: 'building-o', options: opts('All branches', [['juja', 'Juja'], ['ruiru', 'Ruiru']]) },
        { key: 'method', label: 'Payment method', icon: 'credit-card', options: opts('All payment methods', [['mpesa', 'M-Pesa'], ['card', 'Card'], ['bank', 'Bank Transfer'], ['cash', 'Cash']]) },
        { key: 'status', label: 'Status', icon: 'tag', options: opts('All statuses', [['matched', 'Matched'], ['waiting', 'Waiting'], ['unmatched', 'Unmatched']]) },
        { key: 'source', label: 'Source', icon: 'users', options: opts('All sources', [['mpesa_monitor', 'M-Pesa Monitor'], ['pos', 'POS'], ['manual', 'Manual']]) },
        { key: 'sort', label: 'Sort', icon: 'sliders', options: [{ value: 'newest', label: 'Newest first' }, { value: 'oldest', label: 'Oldest first' }, { value: 'amount_desc', label: 'Highest amount' }] },
      ]}
      onFilterChange={(key, value, all) => console.log('filter', key, value, all)}
      onResetFilters={() => { setSource('all'); setSearch(''); }}
      summary={{ amount: 'KES 8,312,500', change: '+4.8%', onViewAll: () => console.log('summary') }}
      methods={{
        onViewAll: () => console.log('methods'),
        items: [
          { key: 'mpesa', label: 'M-Pesa', icon: 'mobile', tone: 'green', amount: 'KES 4,520,300', count: 532, onClick: () => setSource('mpesa') },
          { key: 'card', label: 'Card', icon: 'credit-card', tone: 'blue', amount: 'KES 2,410,800', count: 398, onClick: () => setSource('card') },
          { key: 'bank', label: 'Bank Transfer', icon: 'university', tone: 'purple', amount: 'KES 1,120,500', count: 210, onClick: () => setSource('bank') },
          { key: 'cash', label: 'Cash', icon: 'money', tone: 'amber', amount: 'KES 260,900', count: 131, onClick: () => setSource('cash') },
        ],
      }}
      tip={{ text: 'Use these filters to quickly find similar payments or view transactions from the same date.' }}
      hasMore
      onLoadMore={() => console.log('load more')}
    />
  );
}
