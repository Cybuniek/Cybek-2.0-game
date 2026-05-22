import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/Cybek-2.0-game/' : '/',
  plugins: [react()],
  server: {
    allowedHosts: ['bling-asleep-ether.ngrok-free.dev'],
  },
});
