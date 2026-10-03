import type { ReactNode } from "react";

export default function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <main className="mx-auto mt-10 w-full max-w-7xl flex-1 px-4 pb-28 sm:pb-10">
      <h1 className="font-montserrat text-[clamp(1.75rem,4vw,2.75rem)] leading-[1.1] font-bold tracking-tight uppercase">
        {title}
      </h1>
      <p className="mt-3 max-w-3xl text-[0.95rem] leading-7 text-foreground/70">
        {description}
      </p>
      {children}
    </main>
  );
}
