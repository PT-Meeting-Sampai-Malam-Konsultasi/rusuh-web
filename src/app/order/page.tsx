import { Suspense } from 'react';

import OrderScreen from '@presentation/pages/Order';
import OrderSkeleton from '@presentation/pages/Order/components/OrderSkeleton';

export const metadata = { title: 'Pilih tiket' };

// The controller reads ?event=, so the screen renders on the client behind a same-size fallback.
export default function Page() {
  return (
    <Suspense fallback={<OrderSkeleton withHeader />}>
      <OrderScreen />
    </Suspense>
  );
}
