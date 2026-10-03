-- Esquema de Atlantic Ventas.
-- Toda llave primaria es natural (código de negocio) para que la carga del
-- pipeline sea idempotente: reingerir el mismo Excel actualiza, no duplica.

BEGIN;

CREATE TABLE IF NOT EXISTS asesores (
  cod_asesor text PRIMARY KEY CHECK (cod_asesor ~ '^ASE-[0-9]{3}$'),
  nombre     text NOT NULL,
  sede       text NOT NULL
);

CREATE TABLE IF NOT EXISTS clientes (
  cod_cliente bigint PRIMARY KEY,
  nombre      text NOT NULL,
  tipo        text NOT NULL
);

CREATE TABLE IF NOT EXISTS materiales (
  cod_material  bigint PRIMARY KEY,
  nombre        text NOT NULL,
  categoria     text,
  subcategoria  text,
  producto_base text,
  presentacion  text,
  formato       text,
  calidad       text,
  marca         text
);

-- Hoja "Asesores" del Excel: es la asignacion cliente -> asesor, no un catalogo.
-- Un cliente tiene un unico asesor (11 288 clientes -> 11 288 asignaciones), por eso
-- la llave primaria es solo el cliente: garantiza 1 fila por cliente y que ninguna
-- venta se duplique al unir contra las sedes.
CREATE TABLE IF NOT EXISTS cliente_asesor (
  cod_cliente bigint PRIMARY KEY REFERENCES clientes (cod_cliente) ON DELETE CASCADE,
  cod_asesor  text   NOT NULL REFERENCES asesores (cod_asesor)
);

-- Grano: una fila por (periodo, cliente, material).
CREATE TABLE IF NOT EXISTS ventas (
  periodo      text            NOT NULL CHECK (periodo ~ '^[0-9]{4}-[0-9]{2}$'),
  cod_cliente  bigint          NOT NULL REFERENCES clientes (cod_cliente),
  cod_material bigint          NOT NULL REFERENCES materiales (cod_material),
  neto         numeric(18, 2)  NOT NULL,
  es_nota_credito boolean      NOT NULL GENERATED ALWAYS AS (neto < 0) STORED,
  PRIMARY KEY (periodo, cod_cliente, cod_material)
);

CREATE INDEX IF NOT EXISTS ventas_periodo_idx      ON ventas (periodo);
CREATE INDEX IF NOT EXISTS ventas_cliente_idx      ON ventas (cod_cliente, periodo);
CREATE INDEX IF NOT EXISTS cliente_asesor_asesor_idx ON cliente_asesor (cod_asesor);

COMMIT;
