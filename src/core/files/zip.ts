import JSZip from 'jszip'

export async function createZipBlob(items: Array<{ filename: string; blob: Blob }>) {
  const zip = new JSZip()
  for (const item of items) {
    zip.file(item.filename, item.blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
}

