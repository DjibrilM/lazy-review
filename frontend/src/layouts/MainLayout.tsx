import { Outlet, Link, useLocation } from 'react-router-dom';
import { Header } from './Header';
import { AgentConfirmationModal } from '../components/agent/AgentConfirmationModal';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';
import { useSetup } from '../components/providers/SetupProvider';
import { AlertCircle } from 'lucide-react';
import Visibility from '@/components/common/Visible';

const MainLayout = () => {
  const { isSetupComplete, loading } = useSetup();
  const location = useLocation();

  useSocketEffect({
    onConnect: () => {
      console.log('Embedding Database connected and ready.');
    },
    onDisconnect: () => {
      console.error('Embedding Database connection lost.');
    },
  });

  const showBanner = !loading && !isSetupComplete && location.pathname !== '/settings';

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-200 flex flex-col">
      <div className="sticky top-0 z-50 flex flex-col w-full shadow-sm">
        <Visibility visible={showBanner}>
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 flex items-center justify-center gap-2 text-sm text-yellow-600 backdrop-blur-md">
            <AlertCircle className="w-4 h-4" />
            <span>Local AI models are not fully downloaded. </span>
            <Link to="/settings" className="font-semibold underline hover:no-underline">
              Complete setup in Settings
            </Link>
          </div>
        </Visibility>
        <Header />
      </div>
      <main className="flex-1 h-full">
        <Outlet />
      </main>
      <AgentConfirmationModal />
    </div>
  );
};

export default MainLayout;
