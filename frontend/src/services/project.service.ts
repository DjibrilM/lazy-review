import http from '@/lib/util/http';

export const projectService = {
  async createProject(payload: { repository_name: string; repository_url: string; owner: string }) {
    try {
      const res = await http.post('/projects', payload);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to create project');
    }
  },

  async getProjects() {
    try {
      const res = await http.get('/projects');
      return res.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch projects');
    }
  },

  async getProject(id: string) {
    try {
      const res = await http.get(`/projects/${id}`);
      return res.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch project');
    }
  },

  async deleteProject(id: string) {
    try {
      const res = await http.delete(`/projects/${id}`);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to delete project');
    }
  },

  async reindexProject(id: string) {
    try {
      const res = await http.post(`/projects/${id}/reindex`);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to reindex project');
    }
  },

  async cancelIndexing(id: string) {
    try {
      const res = await http.delete(`/projects/${id}/indexing`);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to cancel indexing');
    }
  },

  async loadModels(id: string) {
    try {
      const res = await http.post(`/projects/${id}/review/models/load`);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to load models');
    }
  },

  async unloadModels(id: string) {
    try {
      const res = await http.post(`/projects/${id}/review/models/unload`);
      return res.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to unload models');
    }
  },

  async getReview(id: string, prNumber: number) {
    try {
      const res = await http.get(`/projects/${id}/review/${prNumber}`);
      return res.data?.data || { status: 'idle' };
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to get review state');
    }
  },

  async deleteReview(id: string, prNumber: number) {
    try {
      await http.delete(`/projects/${id}/review/${prNumber}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to delete review');
    }
  },

  async generateReview(
    id: string,
    payload: { prDiff: string; prTitle: string; prBody: string; prNumber: number },
  ) {
    try {
      const res = await http.post(`/projects/${id}/review`, payload);
      return res.data.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to generate review');
    }
  },

  async chat(
    id: string,
    payload: { history: { role: string; content: string }[]; message: string; prDiff?: string },
  ): Promise<string> {
    try {
      const res = await http.post(`/projects/${id}/chat`, payload);
      return res.data.data.reply;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Chat failed');
    }
  },

  async chatStream(
    id: string,
    payload: {
      history: { role: string; content: string }[];
      message: string;
      prDiff?: string;
      owner?: string;
      repo?: string;
      pull_number?: number;
      additions?: number;
      deletions?: number;
      changed_files?: number;
      creator?: string;
    },
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const url = `${http.defaults.baseURL}/projects/${id}/chat`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Chat failed: ${errorText}`);
    }

    if (!res.body) throw new Error('No response body returned from stream');

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        onChunk(decoder.decode(value, { stream: true }));
      }
    }
  },
};
