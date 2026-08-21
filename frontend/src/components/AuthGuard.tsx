import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { authService } from '@/services/auth.service';
import { Loader2 } from 'lucide-react';
import { FaGithub } from "react-icons/fa";

import { Button } from '@/components/ui/button';
import { GithubLoginModal } from './GithubLoginModal';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  const { data: authStatus, isLoading, refetch } = useQuery({
    queryKey: ['auth-status'],
    queryFn: () => authService.getStatus(),
    retry: false,
  });

  // If loading the auth status, show a spinner
  if (isLoading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // If authenticated, render the app normally
  if (authStatus?.isAuthenticated) {
    return <>{children}</>;
  }

  // If NOT authenticated, show the full screen welcome
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-4">
      <div className="w-full max-w-xs space-y-6 text-center">
        <div className="space-y-4 flex flex-col items-center">
          <img className="h-16 w-16 object-contain mb-26" src="/resources/images/logo.png" alt="Logo" />
          <h1 className="text-2xl font-semibold tracking-tight">Connect GitHub</h1>
          <p className="text-sm text-muted-foreground">
            Connect your account to clone repositories and review pull requests.
          </p>
        </div>

        <Button size="lg" className="w-full" onClick={() => setLoginModalOpen(true)}>
          <FaGithub className="mr-2 h-5 w-5" />
          Connect GitHub
        </Button>
      </div>

      <GithubLoginModal
        open={loginModalOpen}
        onOpenChange={setLoginModalOpen}
        onSuccess={() => refetch()}
      />
    </div>
  );
}
