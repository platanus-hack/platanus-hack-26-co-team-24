/** Formatea milisegundos como segundos con 1 decimal y coma decimal
 * (es-ES), para el chip "GENERADO EN X,X S" del panel de resultado. */
export function formatSeconds(ms: number): string {
  return (ms / 1000).toFixed(1).replace('.', ',');
}
