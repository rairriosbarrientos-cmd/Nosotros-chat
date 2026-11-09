import type { Metadata, Viewport } from 'next';
import './globals.css';

const name = process.env.NEXT_PUBLIC_APP_NAME ?? 'Nosotros';

export const metadata: Metadata = {
  title: name,
  description: 'Nuestro chat privado',
  applicationName: name,
  robots: { index: false, follow: false },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: name, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#14101f',
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
