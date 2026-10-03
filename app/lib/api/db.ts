import pgDefault, { Pool, type QueryResultRow } from "pg";

// int8 (bigint) vuelve como string por defecto en pg. Los codigos de negocio
// caben de sobra en Number y la API los entrega como numeros.
pgDefault.types.setTypeParser(pgDefault.types.builtins.INT8, Number);

const globalForDb = globalThis as unknown as { pool?: Pool };

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

globalForDb.pool = pool;

export const consultar = <T extends QueryResultRow>(sql: string, params: unknown[] = []) =>
  pool.query<T>(sql, params as never[]);
