import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'PeopleFlow — HRM & Learning',
  description: 'พื้นที่เดียวสำหรับดูแลคนและพัฒนาทีมของคุณ',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
