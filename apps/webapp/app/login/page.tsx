import { Badge } from "@stock42/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@stock42/ui/components/card";
import { Activity, Database, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionActor } from "@/lib/session";

export const metadata = { title: "Ingresar" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const actor = await getSessionActor();
  if (actor?.kind === "user") redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden border-r border-border bg-[#09111f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div className="relative">
          <Badge className="mb-8 border-white/10 bg-white/10 text-white">
            STOCK42 / USER SPACE
          </Badge>
          <h1 className="max-w-xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em]">
            Tu operación, con contexto y control.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
            Un punto de acceso seguro al workspace de tu organización y a sus agentes durables.
          </p>
        </div>
        <div className="relative grid gap-5 text-sm text-slate-300">
          {[
            { icon: ShieldCheck, label: "Sesión HttpOnly y protección CSRF" },
            { icon: Database, label: "Estado durable respaldado en MongoDB" },
            { icon: Activity, label: "Progreso en tiempo real y replay" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-md border border-white/10 bg-white/5">
                <Icon className="size-4 text-blue-300" />
              </span>
              {label}
            </div>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Acceso de usuario
            </p>
            <CardTitle className="text-2xl">Ingresá a tu organización</CardTitle>
            <CardDescription>Usá las credenciales asignadas dentro de tu tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
