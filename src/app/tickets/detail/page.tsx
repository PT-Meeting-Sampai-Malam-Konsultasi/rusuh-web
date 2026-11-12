import { Suspense } from 'react';

import TicketDetailScreen from '@presentation/pages/TicketDetail';
import TicketSkeleton from '@presentation/pages/TicketDetail/components/TicketSkeleton';

export const metadata = { title: 'E-tiket' };

// The controller reads ?booking=, so the screen renders on the client behind a same-size fallback.
export default function Page() {
  return (
    <Suspense fallback={<TicketSkeleton />}>
      <TicketDetailScreen />
    </Suspense>
  );
}
