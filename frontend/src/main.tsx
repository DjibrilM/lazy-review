import './App.css';
import { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import Providers from './components/providers/Providers.tsx';
import { SplashScreen } from './components/SplashScreen.tsx';
import './index.css';

const Application = lazy(() => import('./App.tsx'));

createRoot(document.getElementById('root')!).render(
  <Providers>
    <Suspense fallback={<SplashScreen />}>
      <Application />
    </Suspense>
  </Providers>,
);
