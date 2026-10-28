import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000
  },
  resolve: {
    alias: {
      '@presentation': path.resolve(__dirname, 'src/presentation'),
      '@controllers': path.resolve(__dirname, 'src/controllers'),
      '@domain.entities': path.resolve(__dirname, 'src/domain.entities'),
      '@domain.services': path.resolve(__dirname, 'src/domain.services'),
      '@infrastructure.persistence': path.resolve(__dirname, 'src/infrastructure.persistence'),
      '@domain/entities': path.resolve(__dirname, 'src/domain.entities'),
      '@domain/services': path.resolve(__dirname, 'src/domain.services'),
      '@infrastructure/persistence': path.resolve(__dirname, 'src/infrastructure.persistence')
    }
  }
});
