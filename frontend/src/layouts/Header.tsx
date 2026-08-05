import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Settings as SettingsIcon, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { ThemeToggle } from '../components/common/ThemeToggle';
import { UserProfileDialog } from '../features/github/components/UserProfileDialog';
import { githubService } from '@/services/github.service';

export const Header = () => {
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const { data: userProfile } = useQuery({
    queryKey: ['github-authenticated-user'],
    queryFn: () => githubService.getUserProfile('me'),
    retry: false,
  });

  const displayProfile = userProfile;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur-md selection:bg-emerald-500/30">
      <div className="flex h-14 items-center px-4 md:px-6 container mx-auto">
        <Link to="/" className="flex items-center gap-4 cursor-pointer">
          <div className="flex items-center gap-2">
            <img className="size-7" src="/resources/images/logo.png" alt="Logo" />
            <span className="hidden md:inline font-mono text-sm font-bold text-foreground">
              lazy-review<span className="text-muted-foreground font-normal">@ai</span>
            </span>
          </div>
          <div className="hidden h-5 w-px bg-border md:block"></div>
        </Link>

        <div className="ml-auto flex items-center gap-4">
          <Link
            to="/settings"
            className="p-1.5 border border-border text-muted-foreground hover:text-foreground bg-background hover:bg-accent transition-colors rounded-md"
            title="Settings"
          >
            <SettingsIcon size={14} />
          </Link>
          <ThemeToggle />

          {displayProfile?.avatar_url ? (
            <img
              src={displayProfile.avatar_url}
              alt={displayProfile.login || 'User'}
              className="w-8 h-8 rounded-full border border-border object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              title={`Logged in as ${displayProfile.login}`}
              onClick={() => setProfileDialogOpen(true)}
            />
          ) : (
            <div
              className="w-8 h-8 rounded-full bg-accent flex items-center justify-center border border-border text-muted-foreground cursor-pointer hover:ring-2 hover:ring-primary transition-all"
              onClick={() => setProfileDialogOpen(true)}
            >
              <User size={16} />
            </div>
          )}
        </div>
      </div>

      <UserProfileDialog
        open={profileDialogOpen}
        onOpenChange={setProfileDialogOpen}
        profile={displayProfile as any}
      />
    </header>
  );
};
