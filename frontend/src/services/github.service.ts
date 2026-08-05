import type { GitHubRepository } from '../interfaces/github-repo.interface';
import http from '@/lib/util/http';

export interface GitHubRepositoriesResponse {
  items: GitHubRepository[];
  totalCount: number | null;
}

export const githubService = {
  async getListRepositories(pageParam: number): Promise<GitHubRepositoriesResponse> {
    try {
      const res = await http.get(`/github/repositories`, {
        params: { page: pageParam },
      });
      return {
        items: res.data.data || [],
        totalCount: res.data.total_count ?? null,
      };
    } catch (error) {
      throw new Error('Failed to fetch repositories');
    }
  },

  async cloneRepository(payload: { repository_name: string; repository_url: string }) {
    try {
      const res = await http.post('/github/clone', payload);
      return res.data;
    } catch (error) {
      throw new Error('Failed to clone repository');
    }
  },

  async searchRepositories(
    page: number,
    debouncedSearch: string,
  ): Promise<GitHubRepositoriesResponse> {
    try {
      const res = await http.get(`/github/search`, {
        params: {
          q: debouncedSearch,
          page,
        },
      });
      return {
        items: res.data.data || [],
        totalCount: res.data.total_count ?? null,
      };
    } catch (error) {
      throw new Error('Failed to fetch repositories');
    }
  },

  async getUserProfile(username: string): Promise<any> {
    try {
      const res = await http.get(`/github/users/${encodeURIComponent(username)}`);
      return res.data.data;
    } catch (error) {
      throw new Error('Failed to fetch user profile');
    }
  },

  async getPullRequests(owner: string, repo: string): Promise<any> {
    try {
      const res = await http.get(`/github/repos/${owner}/${repo}/pulls`);
      return res.data.data;
    } catch (error) {
      throw new Error('Failed to fetch pull requests');
    }
  },

  async getRepositoryLanguages(url: string): Promise<Record<string, number> | null> {
    try {
      const res = await http.get(url);
      return res.data;
    } catch (e) {
      return null;
    }
  },
};
