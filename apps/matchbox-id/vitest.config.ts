import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      {
        test: {
          name: "worker",
          environment: "node",
          include: ["src/worker/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "app",
          environment: "jsdom",
          include: ["src/app/**/*.test.{ts,tsx}"],
          setupFiles: ["./src/app/test-setup.ts"],
        },
      },
    ],
  },
})
