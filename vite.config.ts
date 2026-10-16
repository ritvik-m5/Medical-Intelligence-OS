import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

/*
 * Where the language model is, from the *server* side.
 *
 * `OLLAMA_HOST` overrides it, so a reader running Ollama somewhere else — another
 * port, another machine on the LAN — can point at it without touching this file.
 */
const LLM_TARGET = process.env.OLLAMA_HOST ?? 'http://localhost:11434';

/*
 * The proxy exists for one reason: to keep the model request same-origin.
 *
 * Ollama refuses browser requests from an unlisted origin, so talking to it
 * directly means setting OLLAMA_ORIGINS and restarting it. Proxying `/llm`
 * through the dev server avoids that entirely — the browser asks this origin, and
 * Vite forwards the request. Nothing has to be opened up, and the default
 * configuration works on a fresh checkout.
 *
 * `changeOrigin` rewrites the Host header, which some servers reject otherwise.
 */
const llmProxy = {
  '/llm': {
    target: LLM_TARGET,
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/llm/, ''),
  },
};

/** GitHub Pages serves from `/Medical-Intelligence-OS/`; local dev uses `/`. */
const base = process.env.VITE_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: false,
    proxy: llmProxy,
  },
  preview: {
    port: 4173,
    proxy: llmProxy,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
