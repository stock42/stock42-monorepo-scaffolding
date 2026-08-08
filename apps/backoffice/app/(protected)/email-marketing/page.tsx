import { redirect } from "next/navigation";
import { EmailMarketingManager } from "@/components/email-marketing-manager";
import { requireBackofficeActor } from "@/lib/session";

export const metadata = { title: "Email marketing" };

export default async function EmailMarketingPage() {
  const actor = await requireBackofficeActor();
  if (!["platform_admin", "tenant_owner"].includes(actor.role)) redirect("/dashboard");

  return (
    <div className="grid gap-7">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Operación / Comunicación
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Email marketing</h1>
        <p className="mt-2 text-muted-foreground">
          Audiencias, plantillas, campañas programadas y operación del spooler por tenant.
        </p>
      </div>
      <EmailMarketingManager fixedTenantId={actor.tenantId} />
    </div>
  );
}
