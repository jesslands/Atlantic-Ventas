import { notFound } from "next/navigation";
import FichaSubcategoria from "../../../components/dashboard/FichaSubcategoria";

export default async function Page({ params }: PageProps<"/materiales/subcategorias/[nombre]">) {
  const { nombre } = await params;
  // Según la versión, el segmento llega codificado o no; un "%" suelto no debe romper la página.
  let subcategoria = nombre;
  try {
    subcategoria = decodeURIComponent(nombre);
  } catch {
    notFound();
  }
  if (!/^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/i.test(subcategoria)) notFound();
  return <FichaSubcategoria nombre={subcategoria} />;
}
