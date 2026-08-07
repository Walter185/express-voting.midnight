import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Midnight DNI Private Verifier | Zero-Knowledge DApp',
  description:
    'DApp privada que verifica identidades DNI usando Zero-Knowledge Proofs (ZK) sobre la red Midnight Network.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="midnight-bg min-h-screen text-slate-100 antialiased selection:bg-purple-500 selection:text-white">
        {children}
      </body>
    </html>
  );
}
