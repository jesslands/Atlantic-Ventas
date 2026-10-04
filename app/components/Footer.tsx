// En movil el dock de navegacion (Nav.tsx) queda fijo abajo: el padding inferior
// deja el enlace por encima de el.
// /api/docs es un route handler que sirve Swagger UI, no una pagina de la app:
// va con <a> y no con <Link>, que intentaria navegarlo del lado del cliente.
export default function Footer() {
  return (
    <footer className="mt-auto px-4 pt-8 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center text-sm sm:pb-8">
      <a
        href="/api/docs"
        target="_blank"
        rel="noopener noreferrer"
        className="text-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
      >
        Documentación de la API (Swagger)
      </a>
    </footer>
  );
}
