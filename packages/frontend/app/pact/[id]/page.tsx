import { PactDetail } from "../../../components/PactDetail";

export default function PactPage({ params }: { params: { id: string } }) {
  return <PactDetail id={params.id} />;
}
