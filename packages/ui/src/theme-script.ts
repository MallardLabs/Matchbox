export const THEME_STORAGE_KEY = "matchbox:theme"

/**
 * Inline this in `<head>` before any stylesheet or module script so the
 * `.dark` class is set before first paint. Plain ES5, no dependencies.
 */
export const themeScript = `(function(){try{var k=${JSON.stringify(THEME_STORAGE_KEY)};var s=null;try{s=window.localStorage.getItem(k)}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`

/** Ready-to-insert tag for `index.html` transforms (e.g. Vite `transformIndexHtml`). */
export const themeScriptTag = `<script>${themeScript}</script>`
