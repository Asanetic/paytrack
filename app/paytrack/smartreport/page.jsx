import { Suspense } from 'react';
import SmartReport from './components/SmartReport';
import { hiveRoutes } from '../../appConfigs/hiveRoutes';

export async function generateMetadata() {
  return {
    title: 'Owners Report',
    description: 'Plain-English owners report: money in, money out and charges',
    icons: { icon: `${hiveRoutes.hiveBaseRoute}/logo.png` },
  };
}

export default function Page() 
{

  return (
  
    <div className="main-wrapper">
      <div className="page-wrapper">
        <div className="content container-fluid p-0 m-0">
          <Suspense fallback={<div className="col-md-12 p-5 text-center h3">Loading...</div>}>
            <SmartReport />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
