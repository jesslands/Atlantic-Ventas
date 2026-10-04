# Cómo se estima la proyección de ventas

Este documento explica la línea punteada **"Proyección"** de la gráfica principal del tablero (tarjeta *Venta neta*, en Resumen) y el cierre del año que aparece en `docs/resumen_gerencia.md`.

## 1. Qué datos usa

- La **venta neta mensual**: la suma de `neto` de la tabla `ventas` por periodo. Incluye las notas crédito con signo negativo en el mes en que se emitieron (hallazgo §4 de `investigacion/DATA_QUALITY.md`). La API no las reimputa al mes de la factura original.
- Los **filtros activos** del tablero (rango de meses, sede y asesor). La proyección se recalcula para lo que se está viendo: si se filtra Medellín, la recta es la de Medellín.
- Con la base actual son **6 meses reales**, de enero a junio de 2026:

| Mes | Venta neta |
|---|---:|
| Enero | $3.183 M |
| Febrero | $2.636 M |
| Marzo | $3.651 M |
| Abril | $3.438 M |
| Mayo | $3.398 M |
| Junio | $3.388 M |
| **Semestre** | **$19.692 M** |

## 2. El método: recta de mínimos cuadrados

El cálculo está en `proyectar()`, en `app/lib/api/analitica.ts`, y lo expone `GET /api/ventas/tendencia`.

1. Se numeran los meses reales: x = 0, 1, …, n−1, y la venta neta de cada mes es y.
2. Se calcula la recta que mejor se ajusta a esos puntos:
   - pendiente = Σ(x − x̄)(y − ȳ) / Σ(x − x̄)²
   - intercepto = ȳ − pendiente · x̄
3. Se prolonga la recta mes a mes hasta diciembre: proyección(x) = intercepto + pendiente · x.
4. El último mes real se repite como primer punto de la línea punteada, para que la proyección salga pegada a la serie real.
5. El **cierre del año** es lo vendido en los meses reales más la suma de los meses proyectados.

Con los datos de hoy, la pendiente es de **+$88,5 M por mes**. Eso da de julio ($3.592 M) a diciembre ($4.035 M) **$22.879 M** para el segundo semestre, y un **cierre de $42.572 M**.

Se eligió una recta porque es transparente, se puede verificar a mano y no necesita más historia de la que hay. Un modelo estacional (Holt-Winters, ARIMA) necesita por lo menos uno o dos años completos de datos.

## 3. Qué tan confiable es

| Prueba | Resultado | Lectura |
|---|---|---|
| Ajuste (R²) sobre los 6 meses | **0,22** | La recta explica solo el 22 % de la variación entre meses. |
| Errores del ajuste por mes | +$122 M, **−$514 M**, +$413 M, +$111 M, −$17 M, −$115 M | Febrero cae muy por debajo de la recta y marzo muy por encima. |
| Prueba hacia atrás: recta entrenada con enero a marzo, comparada con abril a junio | **Sobreestimó un 13,3 %** | La recta tiende a quedarse por encima. |
| Prueba hacia atrás: promedio de enero a marzo, comparado con abril a junio | Subestimó un 7,4 % | El promedio queda más cerca. |

Además, la pendiente positiva viene sobre todo de un febrero débil. Desde marzo la venta baja levemente cada mes: de $3.651 M a $3.388 M.

## 4. Escenarios de cierre 2026

| Escenario | Supuesto | Cierre del año |
|---|---|---:|
| Tendencia (la línea del tablero) | Recta sobre enero a junio | **$42.572 M** |
| Tendencia sin febrero | La misma recta sin el mes atípico (+$26,1 M por mes) | $41.052 M |
| **Conservador (recomendado)** | Se mantiene el promedio de abril a junio ($3.408 M por mes) | **$40.138 M** |
| Pesimista | Recta solo de marzo a junio (−$83,0 M por mes) | $38.014 M |

**Rango razonable: entre $38,0 y $42,6 mil millones. Cifra recomendada para planear: $40,1 mil millones.** La gráfica muestra la recta porque deja ver la dirección. Debajo de la gráfica, en *"¿Cómo se calcula la proyección?"*, el tablero muestra con los filtros activos la pendiente, el R², el cierre por tendencia y el conservador.

## 5. Límites y cómo mejorarla

- **Sin estacionalidad**: no se sabe si diciembre o el inicio de año tienen picos propios. Con el histórico de 2025 se podría agregar un factor estacional por mes. Ese mismo histórico permitiría imputar las 94 notas crédito sin respaldo (hallazgo §5).
- **Sensible a meses atípicos**: con 6 puntos, un solo mes (febrero) mueve la pendiente de +$26 M a +$88 M por mes.
- **Base que se achica**: los clientes que compran cada mes cayeron un 18,5 % de enero a junio, y la venta se sostiene por un ticket más alto. Si la caída de clientes sigue, ningún escenario basado solo en la serie de venta la anticipa. Conviene seguirla aparte en el tablero (*Clientes activos por mes*).
- **Revisión mensual**: cada vez que se carga un Excel nuevo, la recta se recalcula sola. Comparar cada mes lo proyectado contra lo real es la mejor forma de saber si el método sirve.
