import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({ build: { rollupOptions: { input: { registrar: resolve('index.html'), student: resolve('student.html') } } } });
