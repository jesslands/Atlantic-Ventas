-- Esquema de Atlantic Ventas (snapshot acumulado).
-- Ver docs/decisiones.md para la justificacion de cada eleccion.

BEGIN;

CREATE TABLE asesores (
  cod_asesor varchar(7)  PRIMARY KEY CHECK (cod_asesor ~ '^ASE-[0-9]{3}$'),
  nombre     varchar(80) NOT NULL,
  sede       varchar(40) NOT NULL
);

CREATE TABLE clientes (
  cod_cliente bigint      PRIMARY KEY,
  nombre      varchar(160) NOT NULL,
  tipo        varchar(60)  NOT NULL
);

CREATE TABLE materiales (
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

CREATE TABLE cliente_asesor (
  cod_cliente bigint      PRIMARY KEY REFERENCES clientes (cod_cliente) ON DELETE CASCADE,
  cod_asesor  varchar(7)  NOT NULL REFERENCES asesores (cod_asesor)
);

CREATE TABLE ventas (
  periodo      date           NOT NULL CHECK (EXTRACT(DAY FROM periodo) = 1),
  cod_cliente  bigint         NOT NULL REFERENCES clientes (cod_cliente),
  cod_material bigint         NOT NULL REFERENCES materiales (cod_material),
  neto         numeric(18, 2) NOT NULL,
  es_nota_credito boolean      NOT NULL GENERATED ALWAYS AS (neto < 0) STORED,
  PRIMARY KEY (periodo, cod_cliente, cod_material)
);

CREATE INDEX ventas_periodo_idx          ON ventas (periodo);
CREATE INDEX ventas_cliente_idx          ON ventas (cod_cliente, periodo);
CREATE INDEX cliente_asesor_asesor_idx   ON cliente_asesor (cod_asesor);

COMMIT;