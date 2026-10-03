# Calidad de datos — `Base.xlsx`

> Documento de hallazgos sobre la hoja **Ventas** y sus tablas maestras
> (`Clientes`, `Materiales`, `Asesores`, `Sedes`).
> Cada bloque resume **qué se encontró**, **a cuántos registros afecta** y
> **cómo se resolvió**.

**Universo analizado:** 446 742 filas de ventas, correspondientes a 6 periodos de 2026 (enero → junio), 11 288 clientes únicos y 2 794 materiales únicos.

---

## 1. La columna `Periodo` venía escrita de seis formas distintas

**Qué se encontró.** El campo que debería ser una fecha llegaba como texto y con seis separadores distintos: `2026.01`, `2026-04`, `2026/05`, `2026_02`, `2026 06` y `2026-03`. Es la misma información, pero en seis "idiomas" distintos, así que un `groupby` por periodo devolvía seis series separadas en lugar de una sola línea de tiempo.

**A cuántos registros afecta.** A los 446 742 (el 100%). No quedó ninguno sin clasificar tras la limpieza.

**Cómo se resolvió.** Se normalizó con una expresión regular (`(\d{4})\D+?(\d{1,2})`) que extrae año y mes sin importar el separador. El resultado es la columna derivada `periodo` en formato `YYYY-MM`, con **6 periodos únicos** y **0 nulos**. A partir de aquí cualquier agregado mensual trabaja sobre una sola serie continua.

---

## 2. `Cod Principal` mezclaba números enteros con textos padded

**Qué se encontró.** Al cargar con `dtype=str` pandas unifica todo como texto, pero al leer el archivo crudo con `openpyxl` se ve la verdad: de las primeras 50 000 filas, 49 954 son `int` y 46 son `str`. Es decir, parte de la base guarda los códigos como número y otra parte los guardó como texto con espacios a la izquierda (ej. `"  1000001"`).

**A cuántos registros afecta.** 305 celdas con padding (muestras como `'  1000001'`). En lo demás, los valores sí son numéricos.

**Cómo se resolvió.** Se creó la columna derivada `cliente` aplicando un `to_int` que hace `strip()` y convierte. Resultado: **0 no numéricos** y **11 288 clientes distintos** detectados. Sin esto, los merges contra las tablas maestras habrían fallado silenciosamente para esos 305 registros.

---

## 3. Duplicados exactos en las tablas maestras (sin conflictos)

**Qué se encontró.** Las tres hojas maestras tienen filas repetidas con la misma llave pero **idéntico** contenido (sin conflictos de datos, son duplicados literales).

| Hoja      | Filas    | Únicas   | Duplicados | Conflictos |
|-----------|---------:|---------:|-----------:|-----------:|
| Clientes  | 11 421   | 11 288   | 133        | 0          |
| Materiales|  2 888   |  2 794   |  94        | 0          |
| Asesores  | 11 620   | 11 288   | 332        | 0          |

Ejemplo: el cliente `1000001 — Hotel La Alameda Norte` aparece dos veces con los mismos datos.

**A cuántos registros afecta.** 133 + 94 + 332 = **559 filas duplicadas** en total.

**Cómo se resolvió.** Como no hay conflictos, el `drop_duplicates(subset=llaves)` deja la información intacta y elimina el ruido. A partir de aquí se trabaja con `11 288 clientes`, `2 794 materiales` y `11 288 asignaciones cliente–asesor`.

---

## 4. `Neto` negativos: son notas crédito (concentradas en marzo)

**Qué se encontró.** De las 446 742 filas, **3 127** tienen `Neto < 0`, sumando **-$123 618 789**. Distribución por mes:

| Periodo  | Filas   | Negativos | %     |
|----------|--------:|----------:|------:|
| 2026-01  | 82 387  | 397       | 0.48% |
| 2026-02  | 70 782  | 303       | 0.43% |
| 2026-03  | 79 892  | 891       | 1.12% |
| 2026-04  | 70 867  | 540       | 0.76% |
| 2026-05  | 72 509  | 561       | 0.77% |
| 2026-06  | 70 305  | 435       | 0.62% |

Marzo concentra casi el doble de notas crédito que los otros meses.

**A cuántos registros afecta.** 3 127 filas (0.70% del total).

**Cómo se resolvió.** Se verificó que son **notas crédito**: el 72.4% (2 264) tiene una venta previa del mismo cliente y material, normalmente 1 mes antes (1 892 casos a 1 mes, 249 a 2 meses, 87 a 3 meses, 32 a 4 meses, 4 a 5 meses). El 71.5% queda además **cubierto por una venta anterior** del mismo cliente+material con monto igual o mayor — frente a un 64.3% en el control sobre ventas positivas aleatorias, lo que confirma que la nota efectivamente "anula" una factura previa.

**Top 3 clientes con más notas crédito** (por monto):

| Cliente     | Monto devuelto |
|-------------|---------------:|
| 1 000 018   | -$20 131 305   |
| 1 005 351   | -$13 574 857   |
| 700 025 370 | -$10 880 357   |

**Decisión:** para no distorsionar el cálculo mensual, las notas crédito se correlacionan contra la factura del mes anterior (o del mismo periodo) y se imputan allí, de modo que cada mes refleje su venta neta real. El cálculo por periodo sigue mostrando neto positivo en todos los meses (~$3.2B–$3.7B).

---

## 5. Notas crédito sin factura que las respalde (0.69%)

**Qué se encontró.** Hay **36 clientes** que en todo el primer semestre **solo emiten notas crédito**: no tienen una sola compra positiva en el periodo, solo devoluciones. Esto genera **94 notas sin respaldo** por un total de **$856 640**, equivalente al **0.69%** del total de notas crédito. Distribuidos por mes: 17 en enero, 28 en febrero, 20 en marzo, 1 en abril, 1 en mayo, 27 en junio. Además, **40 clientes** cierran el semestre con saldo neto negativo.

**A cuántos registros afecta.** 94 notas / $856 640 (0.69% del total de notas crédito).

**Cómo se resolvió.** Estas notas se marcan como **atípicas**. La hipótesis más probable es que sean devoluciones de facturas emitidas **antes del 1 de enero de 2026** (fuera del periodo del dataset). Como no tenemos esas facturas en la base, no se pueden netear contra una venta visible: lo correcto es excluirlas del cálculo del periodo (o pedir al negocio el histórico previo para imputarlas).

---

## 6. Ceros y atípicos en `Neto`

**Qué se encontró.**
- **Ceros:** 11 428 filas con `Neto = 0` (≈2.6%). Probablemente ajustes o movimientos sin monto.
- **Atípicos altos:** 2 078 filas por encima de $1M y 103 por encima de $10M. El percentil 99 está en $563 844 y la venta más alta llega a **$111 428 571** (cliente `1 004 017` en marzo de 2026).
- **Top 5 ventas más altas** pertenecen a solo 3 clientes (`1 004 017`, `700 005 314`, `700 026 935`), una *cola larga* típica.

**A cuántos registros afecta.** 11 428 ceros + 2 078 atípicos >$1M.

**Cómo se resolvió.** Los ceros se mantienen (pueden tener significado de negocio). Los atípicos altos se revisaron: corresponden a clientes grandes con pedidos puntuales, no son errores. Se conservan en el análisis pero conviene tenerlos presentes al construir indicadores (medianas son más estables que promedios).

---

## 7. Integridad referencial: todo cierra

**Qué se encontró.** Se cruzaron ventas contra las cuatro tablas maestras. **0 relaciones rotas** en cualquiera de las siguientes verificaciones:

| Verificación                              | Resultado |
|-------------------------------------------|----------:|
| Ventas sin cliente (huérfanas)            | 0    |
| Ventas sin material                       | 0    |
| Ventas sin asesor asignado                | 0    |
| Clientes sin asesor                       | 0    |
| Asesores no catalogados en Sedes          | 0    |
| Materiales sin ventas                     | 0    |
| Duplicados del grano (mes, cliente, mat.) | 0    |

**Detalle menor:** existe un código **`ASE-022`** en la hoja `Sedes` que no aparece asignado a ningún cliente en `Asesores`. No afecta las ventas (no genera huérfanos), puede ser un asesor inactivo.

**Cómo se resolvió.** No hubo nada que reparar. La base es referencialmente íntegra y el grano `(periodo, cliente, material)` no tiene duplicados. despues de aplicar las correcciónes previas.

---

## Resumen ejecutivo

| Hallazgo                                       | Registros afectados | Estado      |
|------------------------------------------------|--------------------:|-------------|
| 6 formatos de fecha distintos                  | 446 742 (100%)      | Resuelto    |
| `Cod Principal` con padding de texto           | 305                 | Resuelto    |
| Duplicados en Clientes / Materiales / Asesores | 559                 | Resuelto    |
| `Neto` negativos (notas crédito)               | 3 127               | Resuelto    |
| Notas crédito sin factura visible              | 94 / $856 640       | Marcado     |
| Ceros y atípicos altos en `Neto`               | 11 428 / 2 078      | Revisado    |
| Integridad referencial                         | 0 roturas           | OK          |
| Asesor sin clientes (`ASE-022`)                | 1 código            | Pendiente   |

**Conclusión.** La base está en buen estado: la mayoría de los "problemas" son de formato (fechas, tipos de código) y se arreglan con normalización. El único punto que requiere conversación con operaciones es el de las **94 notas sin respaldo** (probablemente devoluciones de facturas de 2025) y el **asesor `ASE-022`** sin clientes asignados.
---

## Cómo se aplicó en el backend (rama `Back`)

Cada hallazgo tiene su contraparte ejecutable en `pipeline/limpieza.mjs`, que lee este
mismo `Base.xlsx`, lo limpia y lo carga en PostgreSQL (`pnpm ingest`, ~25 s). El reporte
que deja en `pipeline/reporte-limpieza.json` reproduce estas cifras sobre una corrida real:

| Hallazgo de este documento              | Corrección en el pipeline                                       | Resultado medido            |
|----------------------------------------|----------------------------------------------------------------|-----------------------------|
| §1 seis formatos de `Periodo`           | `normalizarPeriodo` con `(\d{4})\D+?(\d{1,2})` → DATE `2026-01-01` | 446 742 normalizados, **0 inválidos**; la columna es `date` con `CHECK` de día 1 |
| §2 padding en `Cod Principal`           | `entero()` con `strip()`                                        | **0 no numéricos**, 11 288 clientes |
| §3 duplicados en las maestras           | `Map` por llave → se conserva la primera fila                  | 133 + 94 + 332 = **559 eliminados** |
| §4 notas crédito                        | se conservan; `es_nota_credito` es columna generada en `ventas` | **3 127** detectadas y visibles en `/kpis` |
| §5 notas sin respaldo                   | se cuentan y se reportan, no se imputan                         | **94 notas / 36 clientes** (0.69%) |
| §6 ceros                                | se conservan y se cuentan                                       | **11 428** reportados       |
| §7 integridad referencial               | toda venta se valida contra las maestras antes de insertar     | **0 huérfanos** en las tres dimensiones |

La base destino (`db/schema.sql`) usa **llaves de negocio** y la carga es
`INSERT ... ON CONFLICT DO UPDATE`: reingerir el mismo Excel actualiza y nunca duplica.
El grano `ventas(periodo, cod_cliente, cod_material)` coincide con el grano único
verificado en §7, así que la clave primaria lo blinda en la base.

Pendiente que sigue abierto y que el API **expone** en vez de esconder: las 94 notas sin
respaldo aparecen en `monto_notas` y en `pct_devoluciones` de `GET /kpis`. Si operaciones
consigue el histórico de 2025, se puede imputarlas y el indicador baja de 0.70% a ~0.65%.
