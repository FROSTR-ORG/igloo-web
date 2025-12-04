import { StoreProvider, useStore } from '@/lib/store';
import UnlockPage from '@/pages/Unlock';
import OnboardingPage from '@/pages/Onboarding';
import SignerPage from '@/pages/Signer';

function Router() {
  const { route } = useStore();
  if (route === 'unlock') return <UnlockPage />;
  if (route === 'onboarding') return <OnboardingPage />;
  return <SignerPage />;
}

export default function App() {
  return (
    <StoreProvider>
      <Router />
    </StoreProvider>
  );
}
