import { Buffer } from "buffer"

// `global` and `process` are shimmed by the inline script in index.html, which
// runs before any module chunk. Buffer needs the npm package, so it lives here.
if (typeof globalThis.Buffer === "undefined") {
  Object.assign(globalThis, { Buffer })
}
