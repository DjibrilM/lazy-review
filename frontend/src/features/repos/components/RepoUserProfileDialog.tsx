import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { githubService } from '@/services/github.service';
import Visible from '@/components/common/Visible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserProfileDialog, } from '@/features/github/components/UserProfileDialog';
import type { User } from '@/lib/interfaces/user.interface';

interface RepoUserProfileDialogProps {
    login: string | null;
    onClose: () => void;
}

export const RepoUserProfileDialog = ({ login, onClose }: RepoUserProfileDialogProps) => {
    const { data: userProfile, isLoading: isUserProfileLoading } = useQuery({
        queryKey: ['github-user-profile', login],
        queryFn: () => githubService.getUserProfile(login!),
        enabled: !!login,
    });

    if (!login) return null;

    // Use the global UserProfileDialog if data is loaded, otherwise show loading state here
    if (userProfile && !isUserProfileLoading) {
        return <UserProfileDialog open={!!login} onOpenChange={(open) => !open && onClose()} profile={userProfile as unknown as User} />;
    }

    return (
        <Dialog open={!!login} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md font-mono">
                <DialogHeader>
                    <DialogTitle>User Profile</DialogTitle>
                </DialogHeader>

                <Visible visible={isUserProfileLoading}>
                    <div className="py-8 flex flex-col items-center justify-center text-muted-foreground space-y-4">
                        <Loader2 className="animate-spin" size={24} />
                        <p className="text-xs">Loading profile...</p>
                    </div>
                </Visible>

                <Visible visible={!isUserProfileLoading && !userProfile}>
                    <div className="py-8 text-center text-red-500/80 text-sm bg-red-500/10 border border-red-500/20 rounded-md">
                        Failed to load user profile.
                    </div>
                </Visible>
            </DialogContent>
        </Dialog>
    );
};
