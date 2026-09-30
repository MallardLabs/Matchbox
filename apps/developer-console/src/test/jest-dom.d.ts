import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"
import type { expect } from "vitest"

// jest-dom's own `vitest` augmentation cannot resolve `vitest` under pnpm's
// isolated layout, so the matchers are declared here.
declare module "vitest" {
  interface Assertion<T = unknown>
    extends TestingLibraryMatchers<
      ReturnType<typeof expect.stringContaining>,
      T
    > {}
  interface AsymmetricMatchersContaining
    extends TestingLibraryMatchers<
      ReturnType<typeof expect.stringContaining>,
      unknown
    > {}
}
