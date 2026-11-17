import { Suspense } from 'react';

import TransactionImporter from '../../import/TransactionImporter';
import { hiveRoutes } from '../../../appConfigs/hiveRoutes';



export async function generateMetadata({ searchParams }) {
  const mosyTitle = 'Import transactions';

  return {
    title: mosyTitle ,
    description: 'Import csv data',
    
    icons: {
        icon: `${hiveRoutes.hiveBaseRoute}/logo.png`
    },    
  };
}
                      

export default function UploadCsvPage() {


   return (
     <>
       <div className='main-wrapper'>
          <div className='page-wrapper'>
             <div className='content container-fluid p-0 m-0'>
              <div className='p-3'>
               <Suspense fallback={<div className='col-md-12 p-5 text-center h3'>Loading...</div>}>
               <TransactionImporter />
              </Suspense>
            </div>
             </div>
           </div>
         </div>
       </>
     );
}