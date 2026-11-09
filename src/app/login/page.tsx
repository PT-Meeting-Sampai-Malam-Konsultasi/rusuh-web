import { Suspense } from 'react';

import LoginScreen from '@presentation/pages/Login';

export const metadata = { title: 'Masuk' };

// The controller reads ?next=, so the screen renders on the client; the fallback is empty for that first frame.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
