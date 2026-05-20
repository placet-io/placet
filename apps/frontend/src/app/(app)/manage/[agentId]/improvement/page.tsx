import { redirect } from 'next/navigation';

export default async function LegacyImprovementPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  redirect(`/manage/${agentId}/versions`);
}
