import { ScannerApp } from '@/components/scanner-app';
export default async function Scan({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;
  return <ScannerApp mode="scan" initialSession={session} />;
}
