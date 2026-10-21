// jest-dom's own vitest typings augment whichever `vitest` pnpm hoists, which
// can be a different major than this package's. Augment ours explicitly.
import type { TestingLibraryMatchers } from "@testing-library/jest-dom/matchers"
import type { expect } from "vitest"

declare module "vitest" {
  // biome-ignore lint/suspicious/noExplicitAny: must match vitest's declaration to merge
  interface Assertion<T = any>
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
