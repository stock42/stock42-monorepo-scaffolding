import { Badge } from "@stock42/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@stock42/ui/components/card";
import { Activity, Building2, Radio, ShieldCheck, UsersRound } from "lucide-react";
import Link from "next/link";
import { requireBackofficeActor } from "@/lib/session";

export const metadata = { title: "Resumen" };

export default async function DashboardPage() {
  const actor = await requireBackofficeActor();
  const isPlatformAdmin = actor.role === "platform_admin";

  return (
    <div className="grid gap-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Control plane
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Estado operativo
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Base de gobierno para tenants, owners, operadores y usuarios.
          </p>
        </div>
        <Badge variant="success">
          <Radio className="animate-pulse" />
          Readiness verificado
        </Badge>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Building2,
            title: "Tenants",
            description: isPlatformAdmin ? "Administración global" : "Tenant asignado",
          },
          { icon: UsersRound, title: "Identidades", description: "Aisladas por tenant" },
          { icon: ShieldCheck, title: "Sesión", description: "Cookies HttpOnly + CSRF" },
        ].map(({ icon: Icon, title, description }) => (
          <Card key={title} className="gap-4 py-5">
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{title}</CardTitle>
                <CardDescription className="mt-2">{description}</CardDescription>
              </div>
              <span className="grid size-10 place-items-center rounded-md bg-accent text-primary">
                <Icon className="size-4" />
              </span>
            </CardHeader>
          </Card>
        ))}
      </section>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="size-4 text-primary" />
            Próximo paso
          </CardTitle>
          <CardDescription>
            {isPlatformAdmin
              ? "Creá un tenant y asigná su owner para comenzar."
              : "Gestioná los operadores y usuarios autorizados de tu tenant."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
            href={isPlatformAdmin ? "/tenants" : "/people"}
          >
            Abrir administración →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
