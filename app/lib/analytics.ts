import type { Cliente, DatosDemo, Venta } from "./mockSales";

const nf = new Intl.NumberFormat("es-CO");
const nf1 = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });

export const money = (n: number) =>
  `${n < 0 ? "-" : ""}$${nf.format(Math.round(Math.abs(n)))}`;

export const moneyCompacto = (n: number) => {
  const abs = Math.abs(n);
  const signo = n < 0 ? "-" : "";
  if (abs >= 1e9) return `${signo}$${nf1.format(abs / 1e9)} mil M`;
  if (abs >= 1e6) return `${signo}$${nf.format(Math.round(abs / 1e6))} M`;
  if (abs >= 1e3) return `${signo}$${nf.format(Math.round(abs / 1e3))} k`;
  return money(n);
};

export const entero = (n: number) => nf.format(n);

export const pct = (n: number, decimales = 1) =>
  `${n >= 0 ? "+" : ""}${n.toFixed(decimales).replace(/\.0+$/, "")}%`;

export const variacion = (actual: number, anterior: number) =>
  anterior ? ((actual - anterior) / Math.abs(anterior)) * 100 : 0;

export const mediana = (valores: number[]) => {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const medio = ordenados.length >> 1;
  return ordenados.length % 2
    ? ordenados[medio]
    : (ordenados[medio - 1] + ordenados[medio]) / 2;
};

export type Filtros = { periodos: string[]; materiales: number[]; sedes: string[] };

export const filtrosVacios: Filtros = {
  periodos: [],
  materiales: [],
  sedes: [],
};

export type FilaPeriodo = {
  periodo: string;
  neto: number;
  ventas: number;
  notas: number;
  montoNotas: number;
  clientes: number;
  ticketMediano: number;
};

export type FilaCliente = {
  codigo: number;
  nombre: string;
  tipo: string;
  sede: string;
  asesor: string;
  neto: number;
  ventas: number;
  ticketMediano: number;
  ticketMedio: number;
  notas: number;
  montoNotas: number;
  ultimaCompra: string;
};

export type FilaAsesor = {
  codigo: string;
  nombre: string;
  sede: string;
  neto: number;
  ventas: number;
  clientes: number;
  ticketMedio: number;
};

export type Analisis = {
  neto: number;
  ventas: number;
  ticketMediano: number;
  totalClientes: number;
  notas: number;
  montoNotas: number;
  ceros: number;
  atipicos: number;
  notasSinRespaldo: { periodo: string; cliente: string; monto: number }[];
  periodos: FilaPeriodo[];
  clientes: FilaCliente[];
  sedes: { sede: string; neto: number; ventas: number; clientes: number }[];
  asesores: FilaAsesor[];
};

type Acumulado = {
  neto: number;
  ventas: number;
  notas: number;
  montoNotas: number;
  ceros: number;
  atipicos: number;
  netos: number[];
  clientes: Set<number>;
  ultimaCompra: string;
  primeraCompra: string;
};

const nuevoAcumulado = (): Acumulado => ({
  neto: 0,
  ventas: 0,
  notas: 0,
  montoNotas: 0,
  ceros: 0,
  atipicos: 0,
  netos: [],
  clientes: new Set(),
  ultimaCompra: "",
  primeraCompra: "9999-99",
});

const acumular = (a: Acumulado, venta: Venta, cliente: Cliente) => {
  a.neto += venta.neto;
  a.ventas += 1;
  a.clientes.add(cliente.codigo);
  if (venta.neto < 0) {
    a.notas += 1;
    a.montoNotas += venta.neto;
  } else {
    if (venta.neto === 0) a.ceros += 1;
    if (venta.neto > 1_000_000) a.atipicos += 1;
    a.netos.push(venta.neto);
  }
  if (venta.periodo > a.ultimaCompra) a.ultimaCompra = venta.periodo;
  if (venta.periodo < a.primeraCompra) a.primeraCompra = venta.periodo;
};

const obtener = <K,>(mapa: Map<K, Acumulado>, clave: K) => {
  let acumulado = mapa.get(clave);
  if (!acumulado) {
    acumulado = nuevoAcumulado();
    mapa.set(clave, acumulado);
  }
  return acumulado;
};

const indices = (datos: DatosDemo) => ({
  cliente: new Map(datos.clientes.map((c) => [c.codigo, c])),
  material: new Map(datos.materiales.map((m) => [m.codigo, m])),
});

export function analizar(datos: DatosDemo, filtros: Filtros): Analisis {
  const { cliente: porCodigoCliente, material: porCodigoMaterial } = indices(datos);

  const total = nuevoAcumulado();
  const porPeriodo = new Map<string, Acumulado>();
  const porCliente = new Map<number, Acumulado>();
  const porMaterial = new Map<number, Acumulado>();
  const porSede = new Map<string, Acumulado>();
  const porAsesor = new Map<string, Acumulado>();
  const conCompra = new Set<number>();
  const notas: Venta[] = [];

  for (const venta of datos.ventas) {
    if (filtros.periodos.length && !filtros.periodos.includes(venta.periodo)) continue;
    const cliente = porCodigoCliente.get(venta.cliente);
    const material = porCodigoMaterial.get(venta.material);
    if (!cliente || !material) continue;
    if (filtros.sedes.length && !filtros.sedes.includes(cliente.sede)) continue;
    if (filtros.materiales.length && !filtros.materiales.includes(venta.material)) continue;

    acumular(total, venta, cliente);
    acumular(obtener(porPeriodo, venta.periodo), venta, cliente);
    acumular(obtener(porCliente, venta.cliente), venta, cliente);
    acumular(obtener(porMaterial, venta.material), venta, cliente);
    acumular(obtener(porSede, cliente.sede), venta, cliente);
    acumular(obtener(porAsesor, cliente.asesor), venta, cliente);

    if (venta.neto > 0) conCompra.add(venta.cliente);
    else if (venta.neto < 0) notas.push(venta);
  }

  const periodos = [...porPeriodo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, a]) => ({
      periodo,
      neto: a.neto,
      ventas: a.ventas,
      notas: a.notas,
      montoNotas: a.montoNotas,
      clientes: a.clientes.size,
      ticketMediano: mediana(a.netos),
    }));

  const clientes: FilaCliente[] = [...porCliente.entries()]
    .map(([codigo, a]) => {
      const c = porCodigoCliente.get(codigo)!;
      return {
        codigo,
        nombre: c.nombre,
        tipo: c.tipo,
        sede: c.sede,
        asesor: c.asesor,
        neto: a.neto,
        ventas: a.ventas,
        ticketMediano: mediana(a.netos),
        ticketMedio: a.neto / a.ventas,
        notas: a.notas,
        montoNotas: a.montoNotas,
        ultimaCompra: a.ultimaCompra,
      };
    })
    .sort((a, b) => b.neto - a.neto);

  const sedeDeAsesor = new Map(datos.clientes.map((c) => [c.asesor, c.sede]));
  const nombreDeAsesor = new Map(datos.sedes.map((s) => [s.asesor, s.nombre]));

  return {
    neto: total.neto,
    ventas: total.ventas,
    ticketMediano: mediana(total.netos),
    totalClientes: total.clientes.size,
    notas: total.notas,
    montoNotas: total.montoNotas,
    ceros: total.ceros,
    atipicos: total.atipicos,
    notasSinRespaldo: notas
      .filter((n) => !conCompra.has(n.cliente))
      .map((n) => ({
        periodo: n.periodo,
        cliente: porCodigoCliente.get(n.cliente)!.nombre,
        monto: n.neto,
      }))
      .sort((a, b) => a.monto - b.monto),
    periodos,
    clientes,
    sedes: [...porSede.entries()]
      .map(([sede, a]) => ({
        sede,
        neto: a.neto,
        ventas: a.ventas,
        clientes: a.clientes.size,
      }))
      .sort((a, b) => b.neto - a.neto),
    asesores: [...porAsesor.entries()]
      .map(([codigo, a]) => ({
        codigo,
        nombre: nombreDeAsesor.get(codigo) ?? codigo,
        sede: sedeDeAsesor.get(codigo) ?? "",
        neto: a.neto,
        ventas: a.ventas,
        clientes: a.clientes.size,
        ticketMedio: a.neto / a.ventas,
      }))
      .sort((a, b) => b.neto - a.neto),
  };
}

export type PuntoProyeccion = {
  periodo: string;
  real: number | null;
  proyeccion: number | null;
};

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
  for (let i = 0; i < n; i++) {
    covarianza += (i - mediaX) * (ys[i] - mediaY);
    varianza += (i - mediaX) ** 2;
  }
  const pendiente = covarianza / varianza;
  const intercepto = mediaY - pendiente * mediaX;

  const [anio, mes] = periodos[n - 1].periodo.split("-").map(Number);
  const ultimo = puntos[n - 1];
  puntos[n - 1] = { ...ultimo, proyeccion: ultimo.real };

  for (let paso = 1; mes + paso <= 12; paso++) {
    puntos.push({
      periodo: `${anio}-${String(mes + paso).padStart(2, "0")}`,
      real: null,
      proyeccion: Math.round(intercepto + pendiente * (n - 1 + paso)),
    });
  }

  return puntos;
}

export function detalleAsesor(
  datos: DatosDemo,
  filtros: Filtros,
  asesor: string,
) {
  const { cliente: porCodigoCliente } = indices(datos);
  const porPeriodo = new Map<string, Acumulado>();
  const porCliente = new Map<number, Acumulado>();

  for (const venta of datos.ventas) {
    if (filtros.periodos.length && !filtros.periodos.includes(venta.periodo)) continue;
    const cliente = porCodigoCliente.get(venta.cliente);
    if (!cliente || cliente.asesor !== asesor) continue;
    if (filtros.materiales.length && !filtros.materiales.includes(venta.material))
      continue;

    acumular(obtener(porPeriodo, venta.periodo), venta, cliente);
    acumular(obtener(porCliente, venta.cliente), venta, cliente);
  }

  return {
    totalClientes: porCliente.size,
    periodos: [...porPeriodo.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodo, a]) => ({ periodo, neto: a.neto, ventas: a.ventas })),
    clientes: [...porCliente.entries()]
      .map(([codigo, a]) => {
        const c = porCodigoCliente.get(codigo)!;
        return {
          codigo,
          nombre: c.nombre,
          tipo: c.tipo,
          sede: c.sede,
          asesor,
          neto: a.neto,
          ventas: a.ventas,
          ticketMediano: mediana(a.netos),
          ticketMedio: a.neto / a.ventas,
          notas: a.notas,
          montoNotas: a.montoNotas,
          ultimaCompra: a.ultimaCompra,
        };
      })
      .sort((a, b) => b.neto - a.neto)
      .slice(0, 10),
  };
}

export function detalleCliente(
  datos: DatosDemo,
  filtros: Filtros,
  codigo: number,
) {
  const { material: porCodigoMaterial } = indices(datos);
  const cliente = datos.clientes.find((c) => c.codigo === codigo);
  const porPeriodo = new Map<string, Acumulado>();
  const porMaterial = new Map<number, Acumulado>();
  const netos: number[] = [];

  for (const venta of datos.ventas) {
    if (venta.cliente !== codigo) continue;
    if (filtros.periodos.length && !filtros.periodos.includes(venta.periodo)) continue;
    if (filtros.materiales.length && !filtros.materiales.includes(venta.material))
      continue;
    const material = porCodigoMaterial.get(venta.material);
    if (!material || !cliente) continue;

    netos.push(venta.neto);
    acumular(obtener(porPeriodo, venta.periodo), venta, cliente);
    acumular(obtener(porMaterial, venta.material), venta, cliente);
  }

  const periodos = [...porPeriodo.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  const total = nuevoAcumulado();
  for (const [, a] of periodos) {
    total.neto += a.neto;
    total.ventas += a.ventas;
    total.notas += a.notas;
    total.montoNotas += a.montoNotas;
  }

  return {
    periodos: periodos.map(([periodo, a]) => ({
      periodo,
      neto: a.neto,
      ventas: a.ventas,
      notas: a.notas,
    })),
    materiales: [...porMaterial.entries()]
      .map(([codigoMaterial, a]) => ({
        nombre: porCodigoMaterial.get(codigoMaterial)!.nombre,
        neto: a.neto,
        ventas: a.ventas,
      }))
      .sort((a, b) => b.neto - a.neto)
      .slice(0, 8),
    neto: total.neto,
    ventas: total.ventas,
    ticketMediano: mediana(netos.filter((n) => n > 0)),
    notas: total.notas,
    montoNotas: total.montoNotas,
    primeraCompra: periodos[0]?.[0] ?? "",
    ultimaCompra: periodos[periodos.length - 1]?.[0] ?? "",
  };
}
