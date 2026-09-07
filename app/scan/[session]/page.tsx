import { PhoneCapture } from '@/components/phone-capture';
export default async function Scan({
  params,
}: {
  params: Promise<{ session: string }>;
}) {
  const { session } = await params;
  return <PhoneCapture session={session} />;
}
