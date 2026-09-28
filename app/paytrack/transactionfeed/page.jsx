import { Suspense } from 'react';

import TransactionFeedHolder from './TransactionFeedHolder';

export async function generateMetadata() {
  const mosyTitle = "Transaction feed";

  return {
    title: mosyTitle,
    description: 'originproject Projects',
    icons: {
      icon: "/logo.png"
    },
  };
}

export default function TransactionFeedPage() {
  return (
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-2 m-0">
          <Suspense fallback={<div>Loading...</div>}>
            <TransactionFeedHolder />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
