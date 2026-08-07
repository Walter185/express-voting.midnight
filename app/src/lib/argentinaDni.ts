/**
 * Datos del DNI Argentino (Documento Nacional de Identidad)
 */
export interface DniArgentinaData {
  dniNumber: string;       // Ejemplo: "38123456"
  gender: 'M' | 'F' | 'X'; // Sexo según DNI
  tramiteNumber: string;   // Número de trámite DNI (11 dígitos, ej. "00123456789")
  birthDate: string;       // YYYY-MM-DD
}

export interface GovernmentValidationResult {
  valid: boolean;
  message: string;
  personInfo?: {
    age: number;
    isAdult: boolean;
    isEligiblePadron: boolean;
    fullName: string;
    district: string;
  };
}

/**
 * Valida la información del DNI Argentino consultando la API de verificación de Gobierno (RENAPER / Padrón Electoral).
 */
export async function verifyDniWithGovernmentApi(
  data: DniArgentinaData
): Promise<GovernmentValidationResult> {
  // Limpiar caracteres no numéricos del DNI y Número de Trámite
  const cleanDni = data.dniNumber.replace(/\D/g, '');
  const cleanTramite = data.tramiteNumber.replace(/\D/g, '');

  // 1. Validaciones estructurales de formato Argentino
  if (cleanDni.length < 7 || cleanDni.length > 8) {
    return {
      valid: false,
      message: 'El DNI argentino debe tener entre 7 y 8 dígitos numéricos.',
    };
  }

  if (cleanTramite.length !== 11) {
    return {
      valid: false,
      message: 'El Número de Trámite del DNI debe tener exactamente 11 dígitos.',
    };
  }

  if (!data.birthDate) {
    return {
      valid: false,
      message: 'La fecha de nacimiento es requerida.',
    };
  }

  // 2. Calcular edad exacta
  const birth = new Date(data.birthDate);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) {
    age--;
  }

  if (age < 18) {
    return {
      valid: false,
      message: `El ciudadano tiene ${age} años. La legislación electoral exige ser mayor de 18 años para votar.`,
      personInfo: {
        age,
        isAdult: false,
        isEligiblePadron: false,
        fullName: 'CIUDADANO MENOR DE EDAD',
        district: 'DISTRITO NACIONAL',
      },
    };
  }

  // 3. Consulta simulada a la API de Gobierno RENAPER / Padrón Electoral
  // En producción, realiza un fetch a https://api.padron.gob.ar/v1/verify o servicio RENAPER
  await new Promise((resolve) => setTimeout(resolve, 800));

  return {
    valid: true,
    message: 'DNI validado exitosamente en el Padrón Electoral (API RENAPER Gobierno).',
    personInfo: {
      age,
      isAdult: true,
      isEligiblePadron: true,
      fullName: `CIUDADANO VALIDADOR (DNI ${cleanDni})`,
      district: 'BUENOS AIRES - DISTRITO ELECTORAL 01',
    },
  };
}

/**
 * Calcula el Nulificador Criptográfico (DNI Nullifier) de 32 bytes (SHA-256).
 * Este valor permite que la red Midnight verifique que el ciudadano no vote dos veces
 * sin revelar la identidad del DNI en el libro público.
 */
export async function computeDniNullifier(data: DniArgentinaData): Promise<{
  nullifierHex: string;
  nullifierBytes: Uint8Array;
}> {
  const cleanDni = data.dniNumber.replace(/\D/g, '');
  const cleanTramite = data.tramiteNumber.replace(/\D/g, '');

  // Sal secreta del dominio de la elección
  const rawData = `ARG_DNI:${cleanDni}|TRAMITE:${cleanTramite}|GENDER:${data.gender}|BIRTH:${data.birthDate}|SALT:MIDNIGHT_EXPRESS_VOTING_2026`;

  const encoder = new TextEncoder();
  const bytesData = encoder.encode(rawData);

  // Calcular SHA-256 localmente en el navegador (100% cliente)
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytesData);
  const nullifierBytes = new Uint8Array(hashBuffer);

  const nullifierHex =
    '0x' +
    Array.from(nullifierBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

  return { nullifierHex, nullifierBytes };
}
