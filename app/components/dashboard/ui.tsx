import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";

export function Tarjeta({
  titulo,
  subtitulo,
  accion,
  children,
  className = "",
}: {
  titulo?: string;
  subtitulo?: string;
  accion?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-foreground/10 bg-white/40 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] sm:p-6 ${className}`}
    >
      {(titulo || accion) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {titulo && (
              <h2 className="font-montserrat text-sm font-bold tracking-wide uppercase">
                {titulo}
              </h2>
            )}
            {subtitulo && (
              <p className="mt-1 text-xs leading-5 text-foreground/60">
                {subtitulo}
              </p>
            )}
          </div>
          {accion}
        </header>
      )}
      {children}
    </section>
  );
}

function Sparkline({ valores }: { valores: number[] }) {
  if (valores.length < 2) return null;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const rango = max - min || 1;
  const puntos = valores
    .map(
      (v, i) =>
        `${((i / (valores.length - 1)) * 100).toFixed(1)},${(
          26 -
          ((v - min) / rango) * 22
        ).toFixed(1)}`,
    )
    .join(" ");

  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      className="h-7 w-full text-[#57522c]"
    >
      <polyline
        points={puntos}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Kpi({
  titulo,
  valor,
  delta,
  detalle,
  serie,
  maloSiSube = false,
}: {
  titulo: string;
  valor: string;
  delta: number | null;
  detalle: string;
  serie: number[];
  maloSiSube?: boolean;
}) {
  const malo = delta !== null && (maloSiSube ? delta > 0 : delta < 0);

  return (
    <article className="flex flex-col justify-between gap-4 rounded-2xl border border-foreground/10 bg-white/40 p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div>
        <h2 className="font-montserrat text-xs font-bold tracking-wide text-foreground/60 uppercase">
          {titulo}
        </h2>
        <p className="mt-2 font-montserrat text-2xl font-bold tracking-tight">
          {valor}
        </p>
      </div>
      <div>
        <Sparkline valores={serie} />
        <p className="mt-2 flex items-baseline gap-2 text-xs">
          {delta !== null && (
            <span
              className={`inline-flex items-center font-montserrat font-bold ${
                malo ? "text-red-800" : "text-[#57522c]"
              }`}
            >
              {delta >= 0 ? (
                <ArrowUpRight aria-hidden="true" className="mr-0.5 h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight aria-hidden="true" className="mr-0.5 h-3.5 w-3.5" />
              )}
              {Math.abs(delta).toFixed(1).replace(/\.0$/, "")}%
            </span>
          )}
          <span className="text-foreground/60">{detalle}</span>
        </p>
      </div>
    </article>
  );
}
