import { ScannerApp } from '@/components/scanner-app';
export default async function Review({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;
  return <ScannerApp mode="review" initialSession={session} />;
}
