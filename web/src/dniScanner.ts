import { readBarcodes } from 'zxing-wasm/reader'

export type DniScanResult = {
  documentNumber: string
  format: string
}

function clean(value: string) {
  return value.replace(/\D/g, '')
}

function findCandidate(raw: string): string | null {
  const matches = raw.match(/\b\d{7,8}\b/g) ?? []
  const unique = [...new Set(matches)]

  return unique.length === 1 ? unique[0] : null
}

function parsePdf417(raw: string): string | null {
  const fields = raw.split('@').map((value) => value.trim())

  for (const index of [4, 1]) {
    const candidate = clean(fields[index] ?? '')

    if (/^\d{7,8}$/.test(candidate)) {
      return candidate
    }
  }

  return findCandidate(raw)
}

async function decode(
  source: File | ImageData,
): Promise<DniScanResult> {
  const results = await readBarcodes(source, {
    formats: ['PDF417', 'QRCode'],
    tryHarder: true,
    maxNumberOfSymbols: 4,
  })

  if (results.length === 0) {
    throw new Error('NO_CODE')
  }

  const result =
    results.find((item) => item.format === 'PDF417') ??
    results[0]

  const documentNumber =
    result.format === 'PDF417'
      ? parsePdf417(result.text)
      : findCandidate(result.text)

  if (!documentNumber) {
    throw new Error('DNI_NOT_FOUND')
  }

  return {
    documentNumber,
    format: result.format,
  }
}

export function scanArgentineDni(file: File) {
  return decode(file)
}

export function scanArgentineDniFrame(imageData: ImageData) {
  return decode(imageData)
}
