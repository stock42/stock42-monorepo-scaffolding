import { BackofficeAgentPanel } from "@/components/backoffice-agent-panel";
import { requireBackofficeActor } from "@/lib/session";

export const metadata = { title: "Agente AI" };

export default async function AgentPage() {
  const actor = await requireBackofficeActor();

  return (
    <div className="grid gap-7">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Operación / Agente AI
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Asistente operativo</h1>
        <p className="mt-2 text-muted-foreground">
          Consultas y operaciones del agente mediante la interfaz HTTP interna.
        </p>
      </div>
      <BackofficeAgentPanel fixedTenantId={actor.tenantId} />
    </div>
  );
}
