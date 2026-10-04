# Resumen para gerencia: ventas de enero a junio de 2026

## Qué pasa con las ventas

- **Venta neta del semestre: $19.692 millones**, en 446.742 transacciones. El segundo trimestre vendió **8,0 % más** que el primero ($10.223 M contra $9.470 M), pero ese crecimiento se debe sobre todo a un febrero débil ($2.636 M).
- **Desde marzo la venta está plana y baja un poco cada mes**: $3.651 M en marzo, $3.438 M en abril, $3.398 M en mayo y $3.388 M en junio (−0,3 % contra mayo).
- **Cada vez se le vende más a menos clientes.** Los clientes que compran cada mes bajaron de 8.253 en enero a 6.723 en junio (**−18,5 %**), mientras el ticket mediano subió de $6.314 a $8.571 (**+36 %**). 3.123 clientes que compraron en el primer trimestre no volvieron en el segundo.
- **La venta depende de pocas cuentas**: el 20 % de los clientes genera el **90,7 %** de la venta, y los 100 más grandes, el 37,1 %. Los pedidos más altos de la base (más de $10 M) son compras puntuales de clientes grandes, no errores (hallazgo §6 de calidad de datos).
- **Las devoluciones suben en monto.** En cantidad de notas crédito, el pico fue marzo (891). En monto, crecen mes a mes: de $13,1 M en enero a $31,5 M en junio, y el segundo trimestre suma **75 % más** que el primero. Bucaramanga multiplicó sus devoluciones por 5,5 y Seafood por 5,7. Siguen siendo menos del 1 % de la venta.
- **Lo que mejor va**: Medellín (+15,5 % del primer al segundo trimestre) y la categoría Cerdo (+18,1 %). Bogotá es la sede más grande (22,5 % de la venta), pero la que menos crece (+2,4 %).

La base es confiable para estas conclusiones: los problemas de calidad que se encontraron (fechas en seis formatos, códigos con espacios, 559 duplicados en las maestras) ya están corregidos en la carga, y no hay ventas huérfanas (`investigacion/DATA_QUALITY.md`).

## Cierre proyectado de 2026

| Escenario | Supuesto | **Cierre del año** |
|---|---|---:|
| Tendencia (línea del tablero) | Recta sobre enero a junio: +$88,5 M por mes | $42.572 M |
| **Conservador (recomendado)** | Se mantiene el promedio de abril a junio ($3.408 M por mes) | **$40.138 M** |
| Pesimista | Sigue la caída de marzo a junio | $38.014 M |

**Para planear, recomendamos $40,1 mil millones, dentro de un rango de $38,0 a $42,6 mil millones.** La recta del tablero es optimista: su pendiente positiva sale de un febrero débil, explica poco de la variación mensual (R² = 0,22) y, en una prueba hacia atrás, sobreestimó abril a junio en un 13,3 %. Con solo seis meses de historia no se puede medir la estacionalidad del segundo semestre. El método completo está en `docs/prediccion.md`.

## Tres recomendaciones

1. **Recuperar clientes y ampliar la base.** Dar a cada asesor su lista de clientes sin compra en los últimos 60 días, ordenada por lo que compraban antes, con una meta mensual de reactivación. El crecimiento actual se apoya solo en tickets más altos de una base que se achica, y ese motor tiene un techo.
2. **Blindar las cuentas clave.** Con el 90,7 % de la venta en el 20 % de los clientes, perder una cuenta grande pesa más que perder cientos de las pequeñas. Proponemos un plan para los 100 principales, con visita y revisión de precios trimestrales y una alerta cuando su compra mensual baje más del 20 %.
3. **Atacar la causa de las devoluciones, empezando por Bucaramanga y Seafood.** Revisar las notas crédito del segundo trimestre por causa (calidad, cadena de frío, errores de facturación) y fijar como meta volver al nivel del primer trimestre. Al mismo tiempo, pedir a operaciones el histórico de 2025 para cerrar las 94 notas sin factura visible ($856.640), que probablemente anulan ventas del año pasado (hallazgo §5).

*Cifras en pesos colombianos, valor neto (ventas menos notas crédito), consultadas sobre la misma base que alimenta el tablero.*
