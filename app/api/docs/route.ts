// Swagger UI servido desde el CDN: la documentacion es una vista de lectura,
// no necesita el paquete swagger-ui-dist en el bundle del servidor.
// Version e integrity van pegadas a proposito (PT-07 en investigacion/Pentesting.md):
// sin el hash, un CDN o paquete comprometido corre JS arbitrario en quien abra
// /api/docs. Para subir de version: bajar los archivos nuevos y recalcular
// `openssl dgst -sha384 -binary archivo | openssl base64`, cambiando los dos juntos.
const HTML = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Atlantic Ventas API</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5.33.1/swagger-ui.css"
      integrity="sha384-Ov4/wv3j2bmct8cDc5X4ngJZohVPzEmc6uDPH8WeljUxO5vtoykvMEfbu9Vh6RaW"
      crossorigin="anonymous"
    />
  </head>
  <body>
    <div id="swagger"></div>
    <script
      src="https://unpkg.com/swagger-ui-dist@5.33.1/swagger-ui-bundle.js"
      integrity="sha384-ZPehFMQommnnuaZ4rpxgkgTT2DKFVp4hZC/7pLit+9Lek9T1YGSo23eHFbvNkXkw"
      crossorigin="anonymous"
    ></script>
    <script>
      window.onload = () =>
        SwaggerUIBundle({ url: "/api/docs/openapi.json", dom_id: "#swagger" });
    </script>
  </body>
</html>`;

export const dynamic = "force-static";

export const GET = () =>
  new Response(HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
