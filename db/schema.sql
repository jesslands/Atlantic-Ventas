-- Esquema de Atlantic Ventas (snapshot acumulado).
-- ESTE ARCHIVO ES DOCUMENTACION: refleja el estado actual de la base.
-- Para aplicar cambios a una base existente, usa el runner de migraciones:
--
--   node db/migrate.mjs
--
-- Las migraciones viven en `db/migrations/` y se ejecutan una vez, en orden,
-- controladas por la tabla `schema_migrations`. El pipeline (`pnpm ingest`)
-- corre las migraciones antes de insertar; este archivo no se vuelve a leer
-- en produccion. Se mantiene sincronizado a mano con la suma de las
-- migraciones para referencia rapida.

BEGIN;

CREATE TABLE IF NOT EXISTS asesores (
  cod_asesor varchar(7)  PRIMARY KEY CHECK (cod_asesor ~ '^ASE-[0-9]{3}$'),
  nombre     varchar(80) NOT NULL,
  sede       varchar(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  cod_cliente bigint      PRIMARY KEY,
  nombre      varchar(160) NOT NULL,
  tipo        varchar(60)  NOT NULL
);

CREATE TABLE IF NOT EXISTS materiales (
  cod_material  bigint      PRIMARY KEY,
  nombre        varchar(200) NOT NULL,
  categoria     varchar(60),
  subcategoria  varchar(60),
  producto_base varchar(80),
  presentacion  varchar(60),
  formato       varchar(40),
  calidad       varchar(40),
  marca         varchar(60)
);

CREATE TABLE IF NOT EXISTS cliente_asesor (
  cod_cliente bigint      PRIMARY KEY REFERENCES clientes (cod_cliente) ON DELETE CASCADE,
  cod_asesor  varchar(7)  NOT NULL REFERENCES asesores (cod_asesor)
);

CREATE TABLE IF NOT EXISTS ventas (
  periodo      date           NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),
  cod_cliente  bigint         NOT NULL REFERENCES clientes (cod_cliente),
  cod_material bigint         NOT NULL REFERENCES materiales (cod_material),
  neto         numeric(18, 2) NOT NULL,
  es_nota_credito boolean      NOT NULL GENERATED ALWAYS AS (neto < 0) STORED,
  PRIMARY KEY (periodo, cod_cliente, cod_material)
);

CREATE INDEX IF NOT EXISTS ventas_periodo_idx          ON ventas (periodo);
CREATE INDEX IF NOT EXISTS ventas_cliente_idx          ON ventas (cod_cliente, periodo);
CREATE INDEX IF NOT EXISTS cliente_asesor_asesor_idx   ON cliente_asesor (cod_asesor);

COMMIT;