/**
 * Funciones puras de analitica compartidas por los endpoints.
 * Nota de integracion: cuando esta rama se una con la rama UI, sus equivalentes
 * en `app/lib/analytics.ts` deben re-exportar estas en vez de repetirlas.
 */

export type FilaPeriodo = {
  periodo: string;
  neto: number;
  ventas: number;
  notas: number;
  monto_notas: number;
  clientes: number;
  ticket_mediano: number;
};

export type PuntoProyeccion = {
  periodo: string;
  real: number | null;
  proyeccion: number | null;
};

/** Variacion porcentual contra un valor de referencia. */
export const variacion = (actual: number, anterior: number) =>
  anterior ? ((actual - anterior) / Math.abs(anterior)) * 100 : 0;

/**
 * Recta de regresion sobre los meses reales y proyeccion hasta diciembre.
 * Con menos de dos periodos no hay tendencia que extrapolar.
 */
export function proyectar(periodos: FilaPeriodo[]): PuntoProyeccion[] {
  const puntos: PuntoProyeccion[] = periodos.map((p) => ({
    periodo: p.periodo,
    real: p.neto,
    proyeccion: null,
  }));
  const n = periodos.length;
  if (n < 2) return puntos;

  const ys = periodos.map((p) => p.neto);
  const mediaX = (n - 1) / 2;
  const mediaY = ys.reduce((a, b) => a + b, 0) / n;
  let covarianza = 0;
  let varianza = 0;
  for (let i = 0; i < n; i += 1) {
    covarianza += (i - mediaX) * (ys[i] - mediaY);
    varianza += (i - mediaX) ** 2;
  }
  const pendiente = covarianza / varianza;
  const intercepto = mediaY - pendiente * mediaX;

  const [anio, mes] = periodos[n - 1].periodo.split("-").map(Number);
  puntos[n - 1] = { ...puntos[n - 1], proyeccion: puntos[n - 1].real };

  for (let paso = 1; mes + paso <= 12; paso += 1) {
    puntos.push({
      periodo: `${anio}-${String(mes + paso).padStart(2, "0")}`,
      real: null,
      proyeccion: Math.round(intercepto + pendiente * (n - 1 + paso)),
    });
  }

  return puntos;
}
