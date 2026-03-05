import { StoreProvider, useStore } from '@/lib/store';
import OnboardingPage from '@/pages/Onboarding';
import SignerPage from '@/pages/Signer';

function Router() {
  const { route } = useStore();
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
