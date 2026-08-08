/**
 * Datos extraídos localmente del PDF417 del DNI argentino.
 *
 * El lector NO autentica el documento contra RENAPER: únicamente interpreta
 * el contenido del código de barras para obtener los campos necesarios de la
 * experiencia de votación.
 */
export interface DniArgentinaData {
  dniNumber: string;
  gender: 'M' | 'F' | 'X';
  tramiteNumber: string;
  birthDate: string;
}
