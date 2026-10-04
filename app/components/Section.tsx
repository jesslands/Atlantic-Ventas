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
    <main className="mx-auto mt-8 w-full max-w-7xl flex-1 px-4 pb-32 sm:mt-12 sm:px-6 sm:pb-16">
      <h1 className="text-[1.6rem] leading-tight font-semibold tracking-[-0.02em] text-balance sm:text-[2rem]">
        {title}
      </h1>
      <p className="mt-2 max-w-[65ch] text-sm leading-6 text-tinta-2 sm:text-[0.95rem]">{description}</p>
      {children}
    </main>
  );
}
