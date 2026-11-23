import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
export default defineConfig({ plugins: [react()], server: { host: "127.0.0.1", port: 8088, strictPort: true, allowedHosts: ["localhost", "tiberio.localhost"] }, preview: { host: "127.0.0.1", port: 8088, strictPort: true }, build: { sourcemap: false } })
