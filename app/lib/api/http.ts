export type DetallesError = Record<string, unknown>;

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly detalles?: DetallesError;

  constructor(status: number, codigo: string, mensaje: string, detalles?: DetallesError) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
    this.detalles = detalles;
  }
}

export const peticionInvalida = (mensaje: string, detalles?: DetallesError) =>
  new ApiError(400, "PARAMETROS_INVALIDOS", mensaje, detalles);

export const noEncontrado = (mensaje: string) =>
  new ApiError(404, "NO_ENCONTRADO", mensaje);

const cuerpo = (status: number, codigo: string, mensaje: string, detalles?: DetallesError) =>
  Response.json({ error: { codigo, mensaje, ...(detalles ? { detalles } : {}) } }, { status });

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
        "Error interno del servidor. Intenta de nuevo más tarde.",
      );
    }
  };