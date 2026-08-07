import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Express Voting | Midnight Network',
  description:
    'Votación electrónica privada sobre Midnight Network con pruebas de conocimiento cero.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="midnight-bg">
        {children}
      </body>
    </html>
  );
}
