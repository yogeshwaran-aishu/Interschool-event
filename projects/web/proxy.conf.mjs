// Dev server proxy: /api goes to the Node.js API, so the refresh cookie stays same-origin.
// Set API_URL to point at another API (Playwright starts one on its own port).
export default {
  '/api': {
    target: process.env.API_URL ?? 'http://localhost:3000',
    secure: false,
    changeOrigin: false,
  },
};
