import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Building2, MapPin, Link as LinkIcon, Users, BookOpen, Clock, Mail } from 'lucide-react';
import { IoLogoTwitter } from 'react-icons/io5';

export interface User {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  gravatar_id: string;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  user_view_type: string;
  site_admin: boolean;
  name: string | null;
  company: string | null;
  blog: string;
  location: string | null;
  email: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username: string | null;
  notification_email: string | null;
  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string;
  updated_at: string;
  total_private_repos?: number;
}

interface UserProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: User | null;
}

export const UserProfileDialog = ({ open, onOpenChange, profile }: UserProfileDialogProps) => {
  if (!profile) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px] font-mono">
        <DialogHeader>
          <DialogTitle>My Profile</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5 pt-2">
          <div className="flex items-start gap-4">
            <img
              src={profile.avatar_url}
              alt={profile.login}
              className="w-16 h-16 rounded-full border-2 border-border shadow-sm object-cover"
            />
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <h3 className="font-bold text-lg leading-tight truncate">
                {profile.name || profile.login}
              </h3>
              <a
                href={profile.html_url}
                target="_blank"
                rel="noreferrer"
                className="text-primary max-w-min hover:underline text-sm truncate"
              >
                @{profile.login}
              </a>
            </div>
          </div>

          {profile.bio && (
            <div className="text-sm text-foreground bg-accent/30 p-3 rounded-md border border-border/50 shadow-inner">
              {profile.bio}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-muted-foreground mt-1">
            {profile.company && (
              <div className="flex items-center gap-2" title={profile.company}>
                <Building2 size={14} className="shrink-0" />
                <span className="truncate">{profile.company}</span>
              </div>
            )}

            {profile.location && (
              <div className="flex items-center gap-2" title={profile.location}>
                <MapPin size={14} className="shrink-0" />
                <span className="truncate">{profile.location}</span>
              </div>
            )}

            {profile.blog && (
              <div className="flex items-center gap-2" title={profile.blog}>
                <LinkIcon size={14} className="shrink-0" />
                <a
                  href={profile.blog.startsWith('http') ? profile.blog : `https://${profile.blog}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-primary hover:underline transition-colors"
                >
                  {profile.blog.replace(/^https?:\/\//, '')}
                </a>
              </div>
            )}

            {profile.twitter_username && (
              <div className="flex items-center gap-2" title="X (Twitter) Profile">
                <IoLogoTwitter size={14} className="shrink-0 text-blue-400" />
                <a
                  href={`https://x.com/${profile.twitter_username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-primary hover:underline transition-colors"
                >
                  @{profile.twitter_username}
                </a>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Users size={14} className="shrink-0" />
              <span>
                <strong className="text-foreground">{profile.followers}</strong> followers
              </span>
            </div>

            <div className="flex items-center gap-2">
              <BookOpen size={14} className="shrink-0" />
              <span>
                <strong className="text-foreground">{profile.public_repos}</strong> public repos
              </span>
            </div>

            {profile.email && (
              <div className="flex items-center gap-2">
                <Mail size={14} className="shrink-0" />
                <span>
                  <strong className="text-foreground">{profile.email}</strong>
                </span>
              </div>
            )}

            <div className="flex items-center gap-2">
              <Clock size={14} className="shrink-0" />
              <span>Joined {new Date(profile.created_at).getFullYear()}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
