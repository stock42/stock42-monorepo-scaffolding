import { Badge } from "@stock42/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@stock42/ui/components/card";
import { Activity, Clock3, Radio, ShieldCheck } from "lucide-react";
import { AgentPanel } from "@/components/agent-panel";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Actividad" };

export default async function DashboardPage() {
  const actor = await requireUser();

  return (
    <div className="grid gap-8">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            Tenant workspace
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
            Buen día, {actor.displayName.split(" ")[0]}.
          </h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Este shell es el punto de partida para las capacidades propias de cada producto.
          </p>
        </div>
        <Badge variant="success">
          <Radio className="animate-pulse" />
          Servicios operativos
        </Badge>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            icon: Activity,
            title: "Actividad",
            value: "Sin tareas pendientes",
            label: "Estado actual",
          },
          { icon: ShieldCheck, title: "Contexto", value: "Tenant aislado", label: "Seguridad" },
          { icon: Clock3, title: "Última sesión", value: "Ahora", label: "Acceso" },
        ].map(({ icon: Icon, title, value, label }) => (
          <Card key={title} className="gap-4 py-5">
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardDescription>{label}</CardDescription>
                <CardTitle className="mt-1 text-base">{title}</CardTitle>
              </div>
              <span className="grid size-9 place-items-center rounded-md bg-accent text-primary">
                <Icon className="size-4" />
              </span>
            </CardHeader>
            <CardContent className="font-mono text-sm">{value}</CardContent>
          </Card>
        ))}
      </section>

      <AgentPanel />
    </div>
  );
}
