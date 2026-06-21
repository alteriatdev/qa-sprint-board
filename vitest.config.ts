import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(() => {
  const env = loadEnv("", process.cwd(), "");

  return {
    plugins: [react()],
    test: {
      environment: "node",
      globals: true,
      env,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
