import type { Metadata } from "next";
import { Bodoni_Moda, Poppins } from "next/font/google";
import { Toaster } from "react-hot-toast";
import BarraMovil from "./components/BarraMovil";
import Header from "./components/Header";
import Motion from "./components/Motion";
import Preloader from "./components/Preloader";
import ExcelUploadModal from "./components/ExcelUploadModal";
import Footer from "./components/Footer";
import "./globals.css";

const display = Bodoni_Moda({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
  style: ["normal", "italic"],
});

const body = Poppins({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Atlantic",
  description:
    "Ventas, clientes, materiales, asesores y sedes de Atlantic en un solo panel.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <Motion>
          <Preloader />
          <ExcelUploadModal />
          <BarraMovil />
          <Header />
          {children}
          <Footer />
        </Motion>
        <Toaster
          position="top-center"
          toastOptions={{
            style: {
              background: "#57522c",
              color: "#f3e5d3",
              borderRadius: "9999px",
              fontFamily: "var(--font-body)",
            },
          }}
        />
      </body>
    </html>
  );
}
