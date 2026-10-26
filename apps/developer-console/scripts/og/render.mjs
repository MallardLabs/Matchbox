// Renders card.html to public/og/<variant>.png with headless Chrome.
// `node scripts/og/render.mjs [outDir]`; set CHROME to override the binary.
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, statSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(process.argv[2] ?? join(here, "../../public/og"))
const variants = ["default", "docs"]

const candidates = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
]
const chrome = candidates.find((path) => path && existsSync(path))
if (chrome === undefined) throw new Error("Chrome not found; set CHROME")

mkdirSync(outDir, { recursive: true })
for (const variant of variants) {
  const page = pathToFileURL(join(here, "card.html"))
  page.searchParams.set("variant", variant)
  const out = join(outDir, `${variant}.png`)
  execFileSync(chrome, [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    "--window-size=1200,630",
    "--virtual-time-budget=5000",
    `--screenshot=${out}`,
    page.href,
  ])
  console.log(`${out} ${Math.round(statSync(out).size / 1024)} KB`)
}
