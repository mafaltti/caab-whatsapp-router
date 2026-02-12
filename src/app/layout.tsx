import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WhatsApp Assistant Router",
  description: "Webhook-driven WhatsApp assistant with Evolution API v2",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
