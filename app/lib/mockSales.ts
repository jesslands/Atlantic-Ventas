export type Cliente = {
  codigo: number;
  nombre: string;
  tipo: string;
  asesor: string;
  sede: string;
};

export type Material = {
  codigo: number;
  nombre: string;
  categoria: string;
  subcategoria: string;
  marca: string;
};

export type Sede = { asesor: string; nombre: string; sede: string };

export type Venta = {
  periodo: string;
  cliente: number;
  material: number;
  neto: number;
};

export type DatosDemo = {
  clientes: Cliente[];
  materiales: Material[];
  sedes: Sede[];
  ventas: Venta[];
};

export const PERIODOS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
];

const CLIENTES = 1500;
const MATERIALES = 400;
const VENTAS = 120_000;

const SEDES = [
  "Bogotá - Norte",
  "Bogotá - Sur",
  "Medellín - Laureles",
  "Medellín - Envigado",
  "Cali - Norte",
  "Barranquilla - Norte",
  "Cartagena - Bocagrande",
  "Bucaramanga - Cabecera",
  "Pereira - Circunvalar",
  "Santa Marta - Rodadero",
];

const TIPOS = [
  "Restaurante",
  "Hotel",
  "Hospital",
  "Colegio",
  "Catering",
  "Supermercado",
];

const PREFIJOS = [
  "Hotel",
  "Restaurante",
  "Catering",
  "Grupo",
  "Comercial",
  "Hotel Boutique",
];

const NUCLEOS = [
  "La Alameda",
  "El Portón",
  "San Rafael",
  "Las Delicias",
  "El Mirador",
  "Doña Ana",
  "El Roble",
  "Laocinata",
  "Rincón Criollo",
  "Villa Verde",
];

const SUFIJOS = ["Norte", "Sur", "Centro", "Parque", "Costa", "Alta", "Nueva"];

const CALIDAD = ["Estándar", "Premium", "Selecta", "Familiar"];

const MARCAS = ["Atlantic", "Del Valle", "Nutri", "Andes", "Sabores del Sur"];

const CATALOGO = [
  { categoria: "Carnes", subcategoria: "Pollo", base: ["Pechuga de pollo", "Muslo de pollo", "Ala de pollo"] },
  { categoria: "Carnes", subcategoria: "Res", base: ["Costilla de res", "Carne molida", "Solomo de res"] },
  { categoria: "Lácteos", subcategoria: "Leches", base: ["Leche entera", "Leche deslactosada", "Crema de leche"] },
  { categoria: "Lácteos", subcategoria: "Quesos", base: ["Queso mozzarella", "Queso gouda", "Queso campesino"] },
  { categoria: "Frutas y verduras", subcategoria: "Frutas", base: ["Mango", "Plátano", "Manzana", "Naranja"] },
  { categoria: "Frutas y verduras", subcategoria: "Verduras", base: ["Tomate", "Papa", "Cebolla", "Zanahoria"] },
  { categoria: "Bebidas", subcategoria: "Gaseosas", base: ["Gaseosa cola", "Gaseosa naranja", "Agua tonica"] },
  { categoria: "Bebidas", subcategoria: "Jugos", base: ["Jugo de mango", "Jugo de durazno", "Bebida de caña"] },
  { categoria: "Panadería", subcategoria: "Pan", base: ["Pan de tajado", "Pan francés", "Pan integral"] },
  { categoria: "Panadería", subcategoria: "Repostería", base: ["Galletas", "Torta de queso", "Galleta de avena"] },
  { categoria: "Congelados", subcategoria: "Helados", base: ["Helado de vainilla", "Helado de chocolate"] },
  { categoria: "Limpieza", subcategoria: "Desinfectantes", base: ["Cloro", "Desinfectante concentrado"] },
  { categoria: "Descartables", subcategoria: "Vajilla", base: ["Vaso descartable", "Plato descartable", "Cubierto"] },
  { categoria: "Descartables", subcategoria: "Cocina", base: ["Papel higiénico", "Bolsa para basura", "Film plástico"] },
];

const PRESENTACIONES = ["500 g", "1 kg", "2 kg", "1 L", "2 L", "Caja x 12", "Bote 700 ml"];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number) {
  return Math.sqrt(-2 * Math.log(rand() || 1e-9)) * Math.cos(2 * Math.PI * rand());
}

const elegir = <T,>(rand: () => number, lista: readonly T[]): T =>
  lista[Math.floor(rand() * lista.length)];

// ponytail: dataset sintético de ~120k filas, no las 446k reales. Subir la escala
// es cambiar VENTAS, pero entonces la agregación en cliente se nota: preagregar por
// (periodo, cliente, material) si se pasa de ~300k.
export function crearDatosDemo(): DatosDemo {
  const rand = mulberry32(20260601);

  const sedes: Sede[] = SEDES.map((sede, index) => ({
    asesor: `ASE-${String(index + 1).padStart(3, "0")}`,
    nombre: `Asesor ${String(index + 1).padStart(3, "0")}`,
    sede,
  }));

  const clientes: Cliente[] = Array.from({ length: CLIENTES }, (_, index) => {
    const asesor = elegir(rand, sedes);
    return {
      codigo: 1_000_001 + index,
      nombre: `${elegir(rand, PREFIJOS)} ${elegir(rand, NUCLEOS)} ${elegir(rand, SUFIJOS)}`,
      tipo: elegir(rand, TIPOS),
      asesor: asesor.asesor,
      sede: asesor.sede,
    };
  });

  const materiales: Material[] = Array.from({ length: MATERIALES }, (_, index) => {
    const item = CATALOGO[index % CATALOGO.length];
    return {
      codigo: 300_001 + index,
      nombre: `${elegir(rand, item.base)} ${elegir(rand, PRESENTACIONES)} ${elegir(rand, CALIDAD)}`,
      categoria: item.categoria,
      subcategoria: item.subcategoria,
      marca: elegir(rand, MARCAS),
    };
  });

  const ventas: Venta[] = Array.from({ length: VENTAS }, () => {
    const cliente = clientes[Math.floor(Math.pow(rand(), 2.4) * CLIENTES)];
    const material = materiales[Math.floor(Math.pow(rand(), 1.8) * MATERIALES)];
    const periodo = PERIODOS[Math.floor(Math.pow(rand(), 1.1) * PERIODOS.length)];
    const magnitud = Math.exp(normal(rand) * 1.2);
    const suerte = rand();
    const monto = Math.round(magnitud * 24_000);

    const neto = suerte < 0.007 ? -monto : suerte < 0.033 ? 0 : monto;

    return { periodo, cliente: cliente.codigo, material: material.codigo, neto };
  });

  // replican el hallazgo de las notas crédito sin factura que las respalde:
  // clientes de cola baja que solo emiten devoluciones
  const cola = clientes.slice(-6).map((c) => c.codigo);
  const sinRespaldo = cola.flatMap((codigo) =>
    ventas.filter((v) => v.cliente === codigo).slice(0, 2),
  );
  for (const venta of sinRespaldo) venta.neto = -Math.abs(venta.neto || 50_000);
  for (let i = ventas.length - 1; i >= 0; i--) {
    const venta = ventas[i];
    if (cola.includes(venta.cliente) && !sinRespaldo.includes(venta)) ventas.splice(i, 1);
  }

  return { clientes, materiales, sedes, ventas };
}

let cache: DatosDemo | null = null;

export const datosDemo = () => (cache ??= crearDatosDemo());
