import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Settings as SettingsIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { UserProfileDialog } from '../features/github/components/UserProfileDialog';
import { GithubLoginModal } from '../components/GithubLoginModal';
import { githubService } from '@/services/github.service';
import Visible from "@/components/common/Visible";

export const Header = () => {
    const [profileDialogOpen, setProfileDialogOpen] = useState(false);

    const [loginModalOpen, setLoginModalOpen] = useState(false);

    const { data: userProfile, refetch: refetchProfile } = useQuery({
        queryKey: ['github-authenticated-user'],
        queryFn: () => githubService.getUserProfile('me'),
        retry: false,
    });

    const displayProfile = userProfile;

    return (
        <header className="w-full border-b border-border bg-background/90 backdrop-blur-md selection:bg-emerald-500/30">
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


                    <Visible visible={displayProfile?.avatar_url} fallback={(
                        <button
                            onClick={() => setLoginModalOpen(true)}
                            className="text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-foreground text-background hover:bg-foreground/90 transition-colors"
                        >
                            Login with GitHub
                        </button>
                    )}>
                        <img
                            src={displayProfile?.avatar_url}
                            alt={displayProfile?.login || 'User'}
                            className="w-8 h-8 rounded-full border border-border object-cover cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                            title={`Logged in as ${displayProfile?.login}`}
                            onClick={() => setProfileDialogOpen(true)}
                        />
                    </Visible>
                </div>
            </div>

            <UserProfileDialog
                open={profileDialogOpen}
                onOpenChange={setProfileDialogOpen}
                profile={displayProfile as any}
            />

            <GithubLoginModal
                open={loginModalOpen}
                onOpenChange={setLoginModalOpen}
                onSuccess={() => refetchProfile()}
            />
        </header>
    );
};
