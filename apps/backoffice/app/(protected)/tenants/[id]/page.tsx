import { Badge } from "@stock42/ui/components/badge";
import { Button } from "@stock42/ui/components/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { TenantPeople } from "@/components/tenant-people";
import { requireBackofficeActor } from "@/lib/session";
import { redirect } from "next/navigation";

export const metadata = { title: "Detalle de tenant" };

export default async function TenantPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireBackofficeActor();
  if (actor.role !== "platform_admin") redirect("/dashboard");
  const { id } = await params;

  return (
    <div className="grid gap-7">
      <div>
        <Button render={<Link href="/tenants" />} size="sm" variant="ghost" className="-ml-3 mb-4">
          <ArrowLeft />
          Volver a tenants
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold tracking-[-0.035em]">Personas del tenant</h1>
          <Badge variant="outline" className="font-mono">
            {id}
          </Badge>
        </div>
        <p className="mt-2 text-muted-foreground">
          Gestioná operadores y usuarios sin cruzar el límite del tenant.
        </p>
      </div>
      <TenantPeople tenantId={id} />
    </div>
  );
}
