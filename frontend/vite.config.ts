import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 前端开发服务器：端口 5173；/api 请求代理到后端 8000，
// 这样前端代码里可以用相对路径（如 /api/health），不写死任何机器目录。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
