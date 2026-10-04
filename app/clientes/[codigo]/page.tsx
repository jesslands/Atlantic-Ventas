import { notFound } from "next/navigation";
import FichaCliente from "../../components/dashboard/FichaCliente";

export default async function Page({ params }: PageProps<"/clientes/[codigo]">) {
  const { codigo } = await params;
  if (!/^\d{1,12}$/.test(codigo)) notFound();
  return <FichaCliente codigo={codigo} />;
}
