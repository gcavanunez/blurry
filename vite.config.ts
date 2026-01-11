import fs from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  server: {
    https: {
      key: fs.readFileSync(
        new URL('../main-uwu.tailbcce82.ts.net.key', import.meta.url),
      ),
      cert: fs.readFileSync(
        new URL('../main-uwu.tailbcce82.ts.net.crt', import.meta.url),
      ),
    },
    hmr: {
      // host: '192.168.18.175',
      host: 'main-uwu.tailbcce82.ts.net',
      // host: 'main-uwu',
    },
  },
})
