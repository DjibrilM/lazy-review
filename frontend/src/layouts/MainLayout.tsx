import { Outlet } from 'react-router-dom';
import { Header } from './Header';
import { AgentConfirmationModal } from '../components/agent/AgentConfirmationModal';
import { useSocketEffect } from '@/lib/hooks/useSocketEffect';

const MainLayout = () => {
  useSocketEffect({
    onConnect: () => {
      console.log('Embedding Database connected and ready.');
    },
    onDisconnect: () => {
      console.error('Embedding Database connection lost.');
    },
  });

  return (
    <div className="min-h-screen bg-background font-sans text-foreground transition-colors duration-200 flex flex-col">
      <Header />
      <main className="flex-1 h-full">
        <Outlet />
      </main>
      <AgentConfirmationModal />
    </div>
  );
};

export default MainLayout;
