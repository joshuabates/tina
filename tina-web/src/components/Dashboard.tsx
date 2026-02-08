import type { Orchestration } from "../types";
import OrchestrationList from "./OrchestrationList";

interface Props {
  orchestrations: Orchestration[];
}

export default function Dashboard({ orchestrations }: Props) {
  return <OrchestrationList orchestrations={orchestrations} />;
}
