"use client";

import { MessageCircle, Share2 } from "lucide-react";
import toast from "react-hot-toast";
import type { FichaCliente } from "../../lib/apiClient";

/**
 * Copia texto al portapapeles. `navigator.clipboard` solo existe en contexto
 * seguro (HTTPS o localhost): abierta por IP o http:// no está, así que se cae
 * al método clásico con un textarea temporal y execCommand.
 */
async function copiar(texto: string) {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(texto);
      return true;
    } catch {
      // Sin permiso: se intenta el método clásico.
    }
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    area.remove();
  }
}

const BOTON =
  "presionable inline-flex h-11 items-center gap-2 rounded-full px-4 text-sm font-medium shadow-[0_1px_2px_rgba(87,82,44,0.08)]";

/** Comparte solo el enlace a la ficha del cliente (nunca cifras en el mensaje). */
export default function CompartirCliente({ ficha }: { ficha: FichaCliente }) {
  // Menú nativo del teléfono (WhatsApp, Telegram, correo…); en escritorio, copia el enlace.
  const compartir = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({ title: ficha.cliente.nombre, url });
        return;
      } catch (error) {
        // Cerrar el menú sin elegir app no es un error.
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }
    if (await copiar(url)) toast.success("Enlace del cliente copiado");
    else toast.error(`No se pudo copiar. Enlace: ${url}`);
  };

  const whatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(window.location.href)}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="flex gap-2">
      <button type="button" onClick={whatsapp} className={`${BOTON} bg-[#1f7a4d] text-white`}>
        <MessageCircle aria-hidden="true" className="h-4 w-4" />
        WhatsApp
      </button>
      <button type="button" onClick={compartir} className={`${BOTON} bg-superficie hover:bg-white`}>
        <Share2 aria-hidden="true" className="h-4 w-4" />
        Compartir
      </button>
    </div>
  );
}
