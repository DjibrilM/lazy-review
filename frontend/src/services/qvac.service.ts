import http from '@/lib/util/http';

export const qvacService = {
  async getModels() {
    try {
      const res = await http.get<{ data: any[] }>('/qvac/models');
      return res.data.data || [];
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Failed to fetch models');
    }
  },
};
