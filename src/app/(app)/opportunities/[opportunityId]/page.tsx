import { OpportunityDetailPage } from "@/features/opportunities/opportunity-detail-page";

export const metadata = { title: "Opportunity" };

export default async function Page({ params }: { params: Promise<{ opportunityId: string }> }) {
  const { opportunityId } = await params;
  return <OpportunityDetailPage opportunityId={opportunityId} />;
}
