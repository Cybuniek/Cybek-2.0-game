import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/Cybek-2.0-game/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replace(/\\/g, '/');
          if (normalized.includes('/src/data/manualBeatmaps.json') || normalized.includes('/src/rhythm.ts')) {
            return 'rhythm-data';
          }
          if (normalized.includes('/src/data/dialogue/') || normalized.includes('/src/neura/StorySceneDirector.ts')) {
            return 'story-data';
          }
          return undefined;
        },
      },
    },
  },
  server: {
    allowedHosts: ['bling-asleep-ether.ngrok-free.dev'],
  },
});
