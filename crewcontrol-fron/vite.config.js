import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: /^@mui\/icons-material\/(.*)$/,
        replacement: path.resolve(__dirname, './node_modules/@mui/icons-material/esm') + '/$1'
      },
      {
        find: '@',
        replacement: path.resolve(__dirname, './src')
      }
    ],
    extensions: ['.js', '.jsx']
  }
})
