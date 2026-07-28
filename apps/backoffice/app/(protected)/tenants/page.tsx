import { TenantManager } from "@/components/tenant-manager";
import { requireBackofficeActor } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Tenants" };

export default async function TenantsPage() {
  const actor = await requireBackofficeActor();
  if (actor.role !== "platform_admin") redirect("/dashboard");

  return (
    <div className="grid gap-7">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Plataforma / Tenants
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Directorio de tenants</h1>
        <p className="mt-2 text-muted-foreground">
          Alta y acceso a organizaciones con ownership explícito.
        </p>
      </div>
      <TenantManager />
    </div>
  );
}
