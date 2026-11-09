import { Suspense } from 'react';

import QueueScreen from '@presentation/pages/Queue';
import QueueJoining from '@presentation/pages/Queue/components/QueueJoining';

export const metadata = { title: 'Ruang tunggu' };

// The controller reads ?event=, so the screen renders on the client behind a same-shape fallback.
export default function Page() {
  return (
    <Suspense fallback={<QueueJoining />}>
      <QueueScreen />
    </Suspense>
  );
}
