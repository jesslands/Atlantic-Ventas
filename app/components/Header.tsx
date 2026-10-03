import Nav from "./Nav";
import Wordmark from "./Wordmark";

export default function Header() {
  return (
    <header className="flex flex-col items-center gap-6 px-4 pt-[var(--logo-top)]">
      <Wordmark className="h-auto w-40 sm:w-60" />
      <Nav />
    </header>
  );
}
