import http from '@/lib/util/http';

export const authService = {
  async startDeviceFlow() {
    try {
      const res = await http.post('/auth/github/device');
      return res.data;
    } catch (error) {
      throw new Error('Failed to start device flow');
    }
  },

  async pollForToken(deviceCode: string) {
    try {
      const res = await http.post('/auth/github/device/poll', { device_code: deviceCode });
      return res.data;
    } catch (error) {
      throw new Error('Failed to poll for token');
    }
  },

  async getStatus() {
    try {
      const res = await http.get('/auth/github/status');
      return res.data;
    } catch (error) {
      throw new Error('Failed to get auth status');
    }
  },

  async logout() {
    try {
      const res = await http.post('/auth/github/logout');
      return res.data;
    } catch (error) {
      throw new Error('Failed to logout');
    }
  },
};
