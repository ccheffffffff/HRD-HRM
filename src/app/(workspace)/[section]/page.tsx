import { notFound } from 'next/navigation';
import { loadWorkspace } from '@/lib/data';
import Workspace from '@/components/workspace';
export const dynamic = 'force-dynamic';
export default async function Page({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (
    ![
      'dashboard',
      'employees',
      'organization',
      'onboarding',
      'attendance',
      'shifts',
      'requests',
      'learning',
      'paths',
      'notifications',
      'readiness',
      'assistant',
      'settings',
    ].includes(section)
  )
    notFound();
  const data = await loadWorkspace();
  return <Workspace key={data.actor.companyId + data.actor.role} section={section} data={data} />;
}
