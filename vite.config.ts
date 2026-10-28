import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Tauri 期望固定端口；web 端也用同一个，避免 devUrl 不一致。
export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  test: {
    // audit/ 存的是审计当时的复现脚本，断言的是修复前的错误行为，不进入常规测试。
    exclude: [...configDefaults.exclude, "audit/**"],
  },
  server: {
    port: 5173,
    strictPort: true,
    host: "127.0.0.1",
    watch: {
      // 编辑器保存时会先写临时文件；沙箱下 chokidar 对消失的 tmp 文件会 EBUSY 崩掉。
      // Tauri 的 Rust target 里是正在编译的二进制，也不能被 dev server 监听。
      ignored: [
        "**/.*.tmpdir/**",
        "**/*.tmp",
        "**/src-tauri/target/**",
        "**/src-tauri/gen/**",
      ],
    },
  },
});
