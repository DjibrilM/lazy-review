import axios from 'axios';

const http = axios.create({
  baseURL: 'http://localhost:16500',
});

export default http;
