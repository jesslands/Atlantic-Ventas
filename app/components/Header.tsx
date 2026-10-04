import FiltrosGenerales from "./dashboard/FiltrosGenerales";
import Nav from "./Nav";
import Wordmark from "./Wordmark";

export default function Header() {
  return (
    <header className="flex flex-col items-center gap-5 px-4 sm:pt-[var(--logo-top)]">
      {/* En móvil el logo y los filtros viven en BarraMovil. */}
      <Wordmark className="hidden h-auto w-60 sm:block" />
      <Nav />
      <div className="hidden w-full sm:block">
        <FiltrosGenerales />
      </div>
    </header>
  );
}
