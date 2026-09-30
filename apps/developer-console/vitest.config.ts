import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

/** Worker suite in Node against the memory store; SPA suite in jsdom. */
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "worker",
          include: ["src/worker/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        plugins: [react()],
        test: {
          name: "spa",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/worker/**", "node_modules/**"],
          environment: "jsdom",
          setupFiles: ["./src/test/setup.ts"],
        },
      },
    ],
  },
})
