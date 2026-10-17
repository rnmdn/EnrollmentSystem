import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({ build: { rollupOptions: { input: { home: resolve('index.html'), registrar: resolve('staff.html'), student: resolve('student.html') } } } });
