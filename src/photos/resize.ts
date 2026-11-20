// Уменьшение фото в браузере: 1024 px для хранения, 768 px jpeg data URL для режиссёра.
import { extractPalette, type Swatch } from './palette'

export const STORE_MAX = 1024
export const LLM_MAX = 768

export interface PreparedPhoto {
  /** jpeg ≤ 1024 px по длинной стороне — хранится в IndexedDB и уходит в ZIP */
  blob: Blob
  /** jpeg ≤ 768 px — для режиссёра */
  dataUrl: string
  /** картинка для полароида на странице */
  image: HTMLCanvasElement
  swatches: Swatch[]
  width: number
  height: number
}

async function decode(src: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(src, { imageOrientation: 'from-image' })
    } catch {
      /* старый браузер — через <img> */
    }
  }
  const url = URL.createObjectURL(src)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return img
  } finally {
    URL.revokeObjectURL(url)
  }
}

function draw(src: CanvasImageSource, w: number, h: number, maxSide: number): HTMLCanvasElement {
  const k = Math.min(1, maxSide / Math.max(w, h))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w * k))
  c.height = Math.max(1, Math.round(h * k))
  const g = c.getContext('2d')!
  g.imageSmoothingQuality = 'high'
  g.drawImage(src, 0, 0, c.width, c.height)
  return c
}

const toBlob = (c: HTMLCanvasElement, q: number) =>
  new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/jpeg', q))

export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const src = await decode(file)
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  const big = draw(src, w, h, STORE_MAX)
  const small = draw(big, big.width, big.height, LLM_MAX)
  if ('close' in src) src.close()
  const blob = await toBlob(big, 0.86)
  const dataUrl = small.toDataURL('image/jpeg', 0.8)
  const tiny = draw(small, small.width, small.height, 64)
  const swatches = extractPalette(tiny.getContext('2d')!.getImageData(0, 0, tiny.width, tiny.height).data, 5)
  return { blob, dataUrl, image: big, swatches, width: big.width, height: big.height }
}

/** Для дней из хранилища: Blob (уже 1024) → то же самое без повторного сжатия. */
export async function photoFromStored(blob: Blob): Promise<PreparedPhoto> {
  const src = await decode(blob)
  const w = 'naturalWidth' in src ? src.naturalWidth : src.width
  const h = 'naturalHeight' in src ? src.naturalHeight : src.height
  const big = draw(src, w, h, STORE_MAX)
  if ('close' in src) src.close()
  const small = draw(big, big.width, big.height, LLM_MAX)
  const tiny = draw(small, small.width, small.height, 64)
  const swatches = extractPalette(tiny.getContext('2d')!.getImageData(0, 0, tiny.width, tiny.height).data, 5)
  return { blob, dataUrl: small.toDataURL('image/jpeg', 0.8), image: big, swatches, width: big.width, height: big.height }
}
