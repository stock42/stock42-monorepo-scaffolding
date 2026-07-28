import { TenantPeople } from "@/components/tenant-people";
import { requireBackofficeActor } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Personas" };

export default async function PeoplePage() {
  const actor = await requireBackofficeActor();
  if (!actor.tenantId) redirect("/dashboard");

  return (
    <div className="grid gap-7">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Tenant / Identidades
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Operadores y usuarios</h1>
        <p className="mt-2 text-muted-foreground">
          Todas las operaciones quedan fijadas a tu tenant.
        </p>
      </div>
      <TenantPeople tenantId={actor.tenantId} />
    </div>
  );
}
