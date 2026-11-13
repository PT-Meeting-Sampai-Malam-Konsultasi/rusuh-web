import { Suspense } from 'react';

import PaymentScreen from '@presentation/pages/Payment';
import PaymentSkeleton from '@presentation/pages/Payment/components/PaymentSkeleton';

export const metadata = { title: 'Pembayaran' };

// The controller reads ?booking=, so the screen renders on the client behind a same-size fallback.
export default function Page() {
  return (
    <Suspense fallback={<PaymentSkeleton withHeader />}>
      <PaymentScreen />
    </Suspense>
  );
}
