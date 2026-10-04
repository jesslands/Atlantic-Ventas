import { notFound } from "next/navigation";
import FichaMaterial from "../../components/dashboard/FichaMaterial";

export default async function Page({ params }: PageProps<"/materiales/[codigo]">) {
  const { codigo } = await params;
  if (!/^\d{1,12}$/.test(codigo)) notFound();
  return <FichaMaterial codigo={codigo} />;
}
