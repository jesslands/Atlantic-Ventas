// Swagger UI servido desde el CDN: la documentacion es una vista de lectura,
// no necesita el paquete swagger-ui-dist en el bundle del servidor.
const HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atlantic Ventas API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () =>
        SwaggerUIBundle({ url: "/api/docs/openapi.json", dom_id: "#swagger" });
    </script>
  </body>
</html>`;

export const dynamic = "force-static";

export const GET = () =>
  new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
