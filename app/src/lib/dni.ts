/**
 * Estructura de datos extraídos del escaneo del DNI
 */
export interface DniData {
  documentNumber: string;
  fullName: string;
  birthDate: string;
  expiryDate: string;
  gender: 'M' | 'F' | 'X';
  nationality: string;
}

/**
 * Calcula el compromiso criptográfico (SHA-256 Hash de 256-bit / 32-bytes) del DNI localmente en el navegador.
 * Este valor se utiliza como entrada privada (Witness) en el circuito Compact de Midnight.
 */
export async function computeDniCommitment(dni: DniData): Promise<{
  hashHex: string;
  witnessBytes: Uint8Array;
}> {
  // Concatenar datos sensibles para generar una firma/hash única
  const rawString = `${dni.documentNumber.trim().toUpperCase()}|${dni.fullName.trim().toUpperCase()}|${dni.birthDate}|${dni.nationality}`;
  
  const encoder = new TextEncoder();
  const data = encoder.encode(rawString);
  
  // Calcular SHA-256 usando Web Crypto API integrada en el navegador (100% cliente)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const witnessBytes = new Uint8Array(hashBuffer);
  
  // Convertir a string Hexadecimal 0x...
  const hashHex =
    '0x' +
    Array.from(witnessBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return { hashHex, witnessBytes };
}
