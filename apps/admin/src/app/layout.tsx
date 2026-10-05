import type { Metadata } from 'next';

import './globals.css';

export const metadata: Metadata = {
  title: 'OCTAGON — панель управления',
  description: 'Web-админка клуба карате OCTAGON',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
