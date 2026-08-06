export type CompressResult = {
  blob: Blob
  width: number
  height: number
  originalSize: number
  compressedSize: number
}

export async function compressImage(
  file: File,
  opts: {
    maxDimension?: number
    quality?: number
    maxBytes?: number
    format?: 'image/jpeg' | 'image/webp'
  } = {},
): Promise<CompressResult> {
  const maxDimension = opts.maxDimension ?? 1280
  const quality = opts.quality ?? 0.7
  const maxBytes = opts.maxBytes ?? 300 * 1024
  const format = opts.format ?? 'image/jpeg'

  if (!file.type.startsWith('image/')) {
    return {
      blob: file,
      width: 0,
      height: 0,
      originalSize: file.size,
      compressedSize: file.size,
    }
  }

  const dataUrl = await readFileAsDataUrl(file)
  const { img, width, height } = await loadImage(dataUrl)

  let targetW = width
  let targetH = height

  if (width > maxDimension || height > maxDimension) {
    const ratio = width / height
    if (width >= height) {
      targetW = maxDimension
      targetH = Math.round(maxDimension / ratio)
    } else {
      targetH = maxDimension
      targetW = Math.round(maxDimension * ratio)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return {
      blob: file,
      width,
      height,
      originalSize: file.size,
      compressedSize: file.size,
    }
  }

  ctx.drawImage(img, 0, 0, targetW, targetH)

  let finalBlob = await canvasToBlob(canvas, format, quality)

  if (maxBytes > 0 && finalBlob.size > maxBytes) {
    const lowerQualities = [0.6, 0.5, 0.4, 0.3]
    for (const q of lowerQualities) {
      finalBlob = await canvasToBlob(canvas, format, q)
      if (finalBlob.size <= maxBytes) break
    }
  }

  if (finalBlob.size > file.size) {
    finalBlob = new Blob([file], { type: file.type || format })
  }

  return {
    blob: finalBlob,
    width: targetW,
    height: targetH,
    originalSize: file.size,
    compressedSize: finalBlob.size,
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<{ img: HTMLImageElement; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ img, width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('No se pudo generar el blob comprimido.'))
      },
      type,
      quality,
    )
  })
}
