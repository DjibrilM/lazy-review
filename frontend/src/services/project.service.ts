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

  async generateReview(id: string, payload: { prDiff: string; prTitle: string; prBody: string }) {
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
};
