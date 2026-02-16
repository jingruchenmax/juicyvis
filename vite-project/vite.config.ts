import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/juicyvis/',  // Replace 'juicyvis' with your actual GitHub repo name
  server: {
    port: 5173
  }
})
