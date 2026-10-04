import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { mockApi } from "./mock/api";

export default defineConfig(({ mode }) => {
  // `vite --mode mock` serves /api from an in-memory mock instead of the backend.
  const useMock = mode === "mock";
  return {
    plugins: [react(), tsconfigPaths(), useMock && mockApi()],
    server: {
      proxy: useMock
        ? undefined
        : {
            "/api": {
              target: "http://localhost:8080",
            },
          },
    },
  };
});
