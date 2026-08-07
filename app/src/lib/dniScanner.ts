import { DniArgentinaData } from './argentinaDni';

/**
 * Parsea una cadena de texto en formato oficial PDF417 de un DNI Argentino escaneado.
 * Estructura estándar PDF417 DNI Argentina:
 * "NRO_TRAMITE@APELLIDO@NOMBRE@SEXO@NUMERO_DNI@EJEMPLAR@FECHA_NACIMIENTO@FECHA_EMISION@..."
 */
export function parseArgentineDniPdf417(rawText: string): {
  data: DniArgentinaData;
  fullName: string;
} | null {
  if (!rawText) return null;

  const parts = rawText.split('@');
  if (parts.length >= 7) {
    const tramiteNumber = parts[0]?.trim() || '';
    const lastName = parts[1]?.trim() || '';
    const firstName = parts[2]?.trim() || '';
    const gender = (parts[3]?.trim().toUpperCase() as 'M' | 'F' | 'X') || 'M';
    const dniNumber = parts[4]?.replace(/\D/g, '') || '';
    const rawBirth = parts[6]?.trim() || '';

    // Convertir fecha de DD/MM/YYYY o YYYYMMDD a YYYY-MM-DD
    let birthDate = '';
    if (rawBirth.includes('/')) {
      const [d, m, y] = rawBirth.split('/');
      if (d && m && y) {
        birthDate = `${y.padStart(4, '20')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    } else if (rawBirth.length === 8) {
      birthDate = `${rawBirth.slice(0, 4)}-${rawBirth.slice(4, 6)}-${rawBirth.slice(6, 8)}`;
    } else if (rawBirth.includes('-')) {
      birthDate = rawBirth;
    }

    if (dniNumber.length >= 7 && tramiteNumber.length === 11 && birthDate) {
      return {
        data: {
          dniNumber,
          gender,
          tramiteNumber,
          birthDate,
        },
        fullName: `${firstName} ${lastName}`.trim() || `DNI ${dniNumber}`,
      };
    }
  }

  return null;
}
