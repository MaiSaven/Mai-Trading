import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const port = parseInt(env.VITE_PORT || env.PORT || '5173', 10);
  const backendTarget = env.VITE_BACKEND_TARGET || 'http://localhost:8000';

  return {
    plugins: [react()],
    server: {
      port,
      host: true,
      proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
