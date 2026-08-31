import axios from 'axios';

const http = axios.create({
  // Relative base: the UI is served by the same Express server that hosts the
  // API, so use same-origin URLs. This also makes custom `-p/--port` and remote
  // hosts work automatically.
  baseURL: '/',
});

export default http;
