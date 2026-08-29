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

  async getPRDiff(owner: string, repo: string, pullNumber: number): Promise<string> {
    try {
      console.log(`[Frontend] Fetching PR Diff for ${owner}/${repo}#${pullNumber}...`);
      const res = await http.get(`/github/repos/${owner}/${repo}/pulls/${pullNumber}/diff`, {
        responseType: 'text',
        timeout: 60000,
      });
      console.log(
        `[Frontend] PR Diff fetch successful. Response type: ${typeof res.data}, Length: ${res.data?.length}`,
      );
      return res.data as string;
    } catch (error: any) {
      console.error(`[Frontend] PR Diff fetch failed!`, error, error.response?.data);
      throw new Error('Failed to fetch PR diff');
    }
  },

  async getPRCommits(owner: string, repo: string, pullNumber: number): Promise<any[]> {
    try {
      const res = await http.get(`/github/repos/${owner}/${repo}/pulls/${pullNumber}/commits`);
      return res.data.data || [];
    } catch (error) {
      throw new Error('Failed to fetch PR commits');
    }
  },

  async submitPRReview(
    owner: string,
    repo: string,
    pullNumber: number,
    body: string,
    event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT',
  ): Promise<any> {
    try {
      const res = await http.post(`/github/repos/${owner}/${repo}/pulls/${pullNumber}/review`, {
        body,
        event,
      });
      return res.data;
    } catch (error) {
      throw new Error('Failed to submit PR review');
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
