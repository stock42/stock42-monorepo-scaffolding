import { Badge } from "@stock42/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@stock42/ui/components/card";
import { Building2, LockKeyhole, Network } from "lucide-react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { getSessionActor } from "@/lib/session";

export const metadata = { title: "Acceso de control" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const actor = await getSessionActor();
  if (actor && actor.kind !== "user") redirect("/dashboard");

  return (
    <main className="grid min-h-screen lg:grid-cols-[0.9fr_1.1fr]">
      <section className="flex items-center justify-center p-6 sm:p-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Stock42 Control
            </p>
            <CardTitle className="text-2xl">Acceso operativo</CardTitle>
            <CardDescription>
              Entrá como administrador de plataforma u operador de tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </section>
      <section className="relative hidden overflow-hidden bg-[#09111f] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div>
          <Badge className="mb-8 border-white/10 bg-white/10 text-white">CONTROL PLANE / 01</Badge>
          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.04] tracking-[-0.045em]">
            Una vista precisa de cada tenant.
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
            Alta, ownership y operación desde una base segura que cada producto puede extender.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: Building2, label: "Tenants" },
            { icon: Network, label: "Aislamiento" },
            { icon: LockKeyhole, label: "Accesos" },
          ].map(({ icon: Icon, label }, index) => (
            <div key={label} className="border-t border-white/15 pt-4">
              <span className="font-mono text-[10px] text-slate-500">0{index + 1}</span>
              <Icon className="my-3 size-5 text-blue-300" />
              <p className="text-sm text-slate-300">{label}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
