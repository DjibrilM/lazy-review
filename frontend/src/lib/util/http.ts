import axios from 'axios';

const backendUrl = typeof window !== 'undefined' ? `http://${window.location.hostname}:16500` : 'http://localhost:16500';

const http = axios.create({
  baseURL: backendUrl,
});

export default http;
