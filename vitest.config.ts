import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'client/**/*.test.ts', 'scripts/**/*.test.ts'],
    clearMocks: true,
  },
});
