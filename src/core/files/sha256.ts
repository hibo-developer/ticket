export async function sha256Hex(input: ArrayBuffer) {
  const hash = await crypto.subtle.digest('SHA-256', input)
  const bytes = new Uint8Array(hash)
  let out = ''
  for (const b of bytes) out += b.toString(16).padStart(2, '0')
  return out
}

export async function sha256HexFile(file: File) {
  const buf = await file.arrayBuffer()
  return sha256Hex(buf)
}

export async function sha256HexBlob(blob: Blob) {
  const buf = await blob.arrayBuffer()
  return sha256Hex(buf)
}
