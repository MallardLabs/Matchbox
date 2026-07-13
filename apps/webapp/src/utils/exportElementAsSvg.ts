const XHTML_NAMESPACE = "http://www.w3.org/1999/xhtml"

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

export async function exportElementAsSvg(
  element: HTMLElement,
  filename: string,
) {
  const bounds = element.getBoundingClientRect()
  const width = Math.ceil(bounds.width)
  const height = Math.ceil(bounds.height)
  const clone = element.cloneNode(true) as HTMLElement

  copyComputedStyles(element, clone)
  preserveFormValues(element, clone)
  await embedImages(clone)

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
