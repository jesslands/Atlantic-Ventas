import { notFound } from "next/navigation";
import FichaCategoria from "../../../components/dashboard/FichaCategoria";

export default async function Page({ params }: PageProps<"/materiales/categorias/[nombre]">) {
  const { nombre } = await params;
  // Según la versión, el segmento llega codificado o no; un "%" suelto no debe romper la página.
  let categoria = nombre;
  try {
    categoria = decodeURIComponent(nombre);
  } catch {
    notFound();
  }
  if (!/^[A-ZÁÉÍÓÚÑ0-9 ._-]{1,60}$/i.test(categoria)) notFound();
  return <FichaCategoria nombre={categoria} />;
}
