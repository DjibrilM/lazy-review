import './App.css';
import { createRoot } from 'react-dom/client';
import Providers from './components/providers/Providers.tsx';
import Application from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <Providers>
    <Application />
  </Providers>,
);
