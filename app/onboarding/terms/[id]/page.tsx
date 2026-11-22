import { notFound } from 'next/navigation';
import { TermDetail } from '../../../../features/onboarding/term-detail';
import { terms } from '../../../../features/onboarding/terms';

export default async function TermPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const term = terms.find(term => term.id === id);
  if (!term) notFound();
  return <TermDetail id={term.id} />;
}
