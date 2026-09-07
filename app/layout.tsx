import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '书页 · 双页扫描与批注',
  description: '手机拍摄展开的书本，自动分割左右页，电脑同步阅读和批注。',
  robots: { index: false, follow: false },
  icons: { icon: '/favicon.svg' },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
