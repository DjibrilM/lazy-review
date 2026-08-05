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
};
