import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistroServiceWorker } from "@/components/RegistroServiceWorker";

export const metadata: Metadata = {
  title: "Nutri em Casa — sua nutricionista virtual 24h",
  description:
    "Consulta nutricional completa com IA, plano alimentar personalizado, biblioteca de receitas e acompanhamento diário. Sua nutricionista particular, disponível 24 horas por dia.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Nutri em Casa",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#22a86a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <RegistroServiceWorker />
      </body>
    </html>
  );
}
