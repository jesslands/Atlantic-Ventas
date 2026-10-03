export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensaje: string,
    readonly detalles?: unknown,
  ) {
    super(mensaje);
  }
}

export const peticionInvalida = (mensaje: string, detalles?: unknown) =>
  new ApiError(400, "PARAMETROS_INVALIDOS", mensaje, detalles);

export const noEncontrado = (mensaje: string) =>
  new ApiError(404, "NO_ENCONTRADO", mensaje);

const cuerpo = (status: number, codigo: string, mensaje: string, detalles?: unknown) =>
  Response.json({ error: { codigo, mensaje, ...(detalles ? { detalles } : {}) } }, { status });

/**
 * Envuelve un handler de rutas: unico lugar donde se traducen excepciones a
 * respuestas. 400/404 explicitos, 500 sin filtrar detalles de la base.
 */
export const manejar = <T extends unknown[]>(
  handler: (...args: T) => Promise<Response>,
) =>
  async (...args: T): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return cuerpo(error.status, error.codigo, error.message, error.detalles);
      }
      console.error("[api] error no controlado", error);
      return cuerpo(
        500,
        "ERROR_INTERNO",
        "Error interno del servidor. Intenta de nuevo mas tarde.",
      );
    }
  };
