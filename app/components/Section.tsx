export default function Section({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <main className="mx-auto mt-12 w-full max-w-6xl flex-1 px-4 pb-28 text-center sm:pb-6">
      <h1 className="font-serif text-[clamp(2rem,6vw,3.5rem)] leading-[1.05] font-black uppercase">
        {title}
      </h1>
      <p className="mx-auto mt-5 max-w-2xl text-[clamp(0.9rem,1.15vw,1.05rem)] leading-[1.7] text-foreground/70">
        {description}
      </p>
    </main>
  );
}
