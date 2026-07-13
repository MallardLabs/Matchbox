const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml"
const FONT_STYLESHEET_HOST = "fonts.googleapis.com"

let embeddedFontCss: string | null = null
let embeddedFontCssRequest: Promise<string> | null = null

function copyComputedStyles(source: Element, clone: Element) {
  const computed = window.getComputedStyle(source)
  const cloneElement = clone as HTMLElement | SVGElement

  for (const property of computed) {
    cloneElement.style.setProperty(
      property,
      computed.getPropertyValue(property),
      computed.getPropertyPriority(property),
    )
  }

  Array.from(source.children).forEach((child, index) => {
    const clonedChild = clone.children.item(index)
    if (clonedChild) copyComputedStyles(child, clonedChild)
  })
}

function preserveFormValues(source: Element, clone: Element) {
  const sourceFields = source.querySelectorAll("input, textarea, select")
  const clonedFields = clone.querySelectorAll("input, textarea, select")

  sourceFields.forEach((field, index) => {
    const clonedField = clonedFields.item(index)
    if (
      field instanceof HTMLInputElement &&
      clonedField instanceof HTMLInputElement
    ) {
      clonedField.setAttribute("value", field.value)
    } else if (
      field instanceof HTMLTextAreaElement &&
      clonedField instanceof HTMLTextAreaElement
    ) {
      clonedField.textContent = field.value
    } else if (
      field instanceof HTMLSelectElement &&
      clonedField instanceof HTMLSelectElement
    ) {
      Array.from(clonedField.options).forEach((option, optionIndex) => {
        option.selected = field.options.item(optionIndex)?.selected ?? false
      })
    }
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function embedCssUrls(css: string, stylesheetUrl: string) {
  const urlPattern = /url\(\s*(["']?)(.*?)\1\s*\)/g
  const matches = Array.from(css.matchAll(urlPattern))
  const replacements = new Map<string, string>()

  await Promise.all(
    matches.map(async (match) => {
      const source = match[2]
      if (!source || source.startsWith("data:") || replacements.has(source)) {
        return
      }

      try {
        const absoluteUrl = new URL(source, stylesheetUrl).href
        const response = await fetch(absoluteUrl, { mode: "cors" })
        if (!response.ok) return
        replacements.set(source, await blobToDataUrl(await response.blob()))
      } catch {
        // Preserve the remote URL if a font host does not allow embedding.
      }
    }),
  )

  return css.replace(urlPattern, (original, _quote: string, source: string) => {
    const replacement = replacements.get(source)
    return replacement ? `url("${replacement}")` : original
  })
}

async function loadEmbeddedFontCss() {
  if (embeddedFontCss !== null) return embeddedFontCss
  if (embeddedFontCssRequest) return embeddedFontCssRequest

  embeddedFontCssRequest = (async () => {
    const stylesheetUrls = Array.from(
      document.querySelectorAll<HTMLLinkElement>(
        'link[rel~="stylesheet"][href]',
      ),
    )
      .map((link) => link.href)
      .filter((href) => {
        try {
          return new URL(href).hostname === FONT_STYLESHEET_HOST
        } catch {
          return false
        }
      })

    const stylesheets = await Promise.all(
      stylesheetUrls.map(async (stylesheetUrl) => {
        try {
          const response = await fetch(stylesheetUrl, { mode: "cors" })
          if (!response.ok) return ""
          return embedCssUrls(await response.text(), stylesheetUrl)
        } catch {
          return ""
        }
      }),
    )

    const css = stylesheets.filter(Boolean).join("\n")
    if (css) embeddedFontCss = css
    embeddedFontCssRequest = null
    return css
  })()

  return embeddedFontCssRequest
}

function embedFontStyles(clone: Element, css: string) {
  if (!css) return

  const style = document.createElement("style")
  style.textContent = css
  clone.prepend(style)
}

async function embedImages(clone: Element) {
  const images = Array.from(clone.querySelectorAll("img"))
  await Promise.all(
    images.map(async (image) => {
      if (!image.src || image.src.startsWith("data:")) return
      try {
        const response = await fetch(image.src, { mode: "cors" })
        if (!response.ok) return
        image.src = await blobToDataUrl(await response.blob())
      } catch {
        // Keep the original URL when an image host does not allow CORS.
      }
    }),
  )
}

function applyExportOverrides(clone: Element) {
  for (const removable of clone.querySelectorAll("[data-svg-export-remove]")) {
    removable.remove()
  }

  for (const container of clone.querySelectorAll<HTMLElement>(
    "[data-svg-export-fill]",
  )) {
    container.style.width = "100%"
    container.style.maxWidth = "none"
    container.style.flexGrow = "1"
    container.style.flexShrink = "1"

    const details = container.lastElementChild as HTMLElement | null
    if (!details) continue
    details.style.width = "100%"
    details.style.maxWidth = "none"
    details.style.flexGrow = "1"

    for (const row of details.children) {
      const rowElement = row as HTMLElement
      rowElement.style.width = "100%"
      rowElement.style.maxWidth = "none"
    }

    const name = details.firstElementChild
      ?.firstElementChild as HTMLElement | null
    if (name) {
      name.style.width = "auto"
      name.style.maxWidth = "none"
      name.style.flexGrow = "1"
    }
  }

  for (const container of clone.querySelectorAll<HTMLElement>(
    "[data-svg-export-nowrap]",
  )) {
    const elements = [
      container,
      ...container.querySelectorAll<HTMLElement>("*"),
    ]
    for (const element of elements) {
      element.style.width = "max-content"
      element.style.maxWidth = "none"
      element.style.overflow = "visible"
      element.style.textOverflow = "clip"
      element.style.whiteSpace = "nowrap"
      element.style.flexShrink = "0"
    }
  }
}

export async function exportElementAsSvg(
  element: HTMLElement,
  filename: string,
) {
  const ignoredElements = Array.from(
    element.querySelectorAll<HTMLElement>("[data-svg-export-ignore]"),
  )
  const previousDisplayValues = ignoredElements.map(
    (ignoredElement) => ignoredElement.style.display,
  )
  for (const ignoredElement of ignoredElements) {
    ignoredElement.style.display = "none"
  }

  let width: number
  let height: number
  let clone: HTMLElement
  try {
    const bounds = element.getBoundingClientRect()
    width = Math.ceil(bounds.width)
    height = Math.ceil(bounds.height)
    clone = element.cloneNode(true) as HTMLElement
    copyComputedStyles(element, clone)
    preserveFormValues(element, clone)
    applyExportOverrides(clone)
  } finally {
    for (const [index, ignoredElement] of ignoredElements.entries()) {
      ignoredElement.style.display = previousDisplayValues[index] ?? ""
    }
  }
  await embedImages(clone)
  embedFontStyles(clone, await loadEmbeddedFontCss())

  clone.setAttribute("xmlns", XHTML_NAMESPACE)
  clone.style.width = `${width}px`
  clone.style.height = `${height}px`
  clone.style.margin = "0"

  const markup = new XMLSerializer().serializeToString(clone)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><foreignObject width="100%" height="100%">${markup}</foreignObject></svg>`
  const url = URL.createObjectURL(
    new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
  )
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
