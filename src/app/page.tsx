import HomeScreen from '@presentation/pages/Home';

// The layout's title template only applies to child segments, so the root page sets its full title.
export const metadata = { title: { absolute: 'Event · Rusuh' } };

export default function Page() {
  return <HomeScreen />;
}
