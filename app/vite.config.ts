import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@artifacts": path.resolve(__dirname, "../out"),
    },
  },
  server: {
    fs: { allow: [".."] },
  },
});
