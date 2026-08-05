import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SocketProvider from './SocketProvider';
import { Provider as JotaiProvider } from 'jotai';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '../../hooks/useTheme';

const queryClient = new QueryClient();

interface ProvidersProps {
  children: ReactNode;
}

const ThemedToaster = () => {
  const { theme } = useTheme();
  return <Toaster theme={theme} position="top-center" />;
};

const Providers = ({ children }: ProvidersProps) => {
  return (
    <SocketProvider>
      <JotaiProvider>
        <QueryClientProvider client={queryClient}>
          {children}
          <ThemedToaster />
        </QueryClientProvider>
      </JotaiProvider>
    </SocketProvider>
  );
};

export default Providers;
