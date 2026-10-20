import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri 期望固定端口；web 端也用同一个，避免 devUrl 不一致。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // 编辑器保存时会先写临时文件；沙箱下 chokidar 对消失的 tmp 文件会 EBUSY 崩掉。
      ignored: ["**/.*.tmpdir/**", "**/*.tmp"],
    },
  },
});
