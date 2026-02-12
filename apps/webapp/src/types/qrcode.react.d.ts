declare module "qrcode.react" {
  import type { ComponentType } from "react"

  export type QRCodeImageSettings = {
    src: string
    x?: number
    y?: number
    height?: number
    width?: number
    excavate?: boolean
    opacity?: number
  }

  export type QRCodeSVGProps = {
    value: string
    size?: number
    level?: "L" | "M" | "Q" | "H"
    includeMargin?: boolean
    bgColor?: string
    fgColor?: string
    imageSettings?: QRCodeImageSettings
  }

  export const QRCodeSVG: ComponentType<QRCodeSVGProps>
}
