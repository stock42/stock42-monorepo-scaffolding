import type { SessionActor } from "@stock42/contracts/auth";
import { Badge } from "@stock42/ui/components/badge";
import { Button } from "@stock42/ui/components/button";
import { Separator } from "@stock42/ui/components/separator";
import {
  Activity,
  Bot,
  Building2,
  ChevronRight,
  CircleGauge,
  Settings2,
  Shield,
  Sparkles,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "./logout-button";

export function ControlShell({
  actor,
  children,
}: {
  actor: SessionActor;
  children: React.ReactNode;
}) {
  const isPlatformAdmin = actor.role === "platform_admin";
  const navigation = [
    { href: "/dashboard", label: "Resumen", icon: CircleGauge, visible: true },
    { href: "/tenants", label: "Tenants", icon: Building2, visible: isPlatformAdmin },
    { href: "/people", label: "Personas", icon: UsersRound, visible: !isPlatformAdmin },
    { href: "/agent", label: "Agente AI", icon: Sparkles, visible: true },
    {
      href: "/telegram-ai",
      label: "Telegram AI",
      icon: Bot,
      visible: isPlatformAdmin || actor.role === "tenant_owner",
    },
  ].filter((item) => item.visible);

  return (
    <div className="min-h-screen bg-background/92">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-border bg-[#09111f] text-slate-100 lg:flex lg:flex-col">
        <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
        <div className="flex h-20 items-center gap-3 px-7">
          <span className="grid size-10 place-items-center rounded-lg border border-white/10 bg-white/5 font-mono text-sm font-bold">
            S42
          </span>
          <div>
            <p className="font-semibold tracking-tight">Control</p>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-400">
              Multi-tenant
            </p>
          </div>
        </div>
        <Separator className="bg-white/10" />
        <nav className="grid gap-1 p-4">
          <p className="mb-2 px-3 font-mono text-[10px] uppercase tracking-[0.18em] text-slate-500">
            Operación
          </p>
          {navigation.map(({ href, label, icon: Icon }) => (
            <Button
              key={href}
              render={<Link href={href} />}
              variant="ghost"
              className="justify-start text-slate-300 hover:bg-white/8 hover:text-white"
            >
              <Icon />
              {label}
              <ChevronRight className="ml-auto size-3.5 opacity-50" />
            </Button>
          ))}
        </nav>
        <div className="mt-auto p-5">
          <div className="rounded-lg border border-white/10 bg-white/5 p-4">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="size-2 rounded-full bg-emerald-400" />
              API disponible
            </div>
            <p className="mt-2 font-mono text-[10px] text-slate-500">WS / MONGO / AGENT</p>
          </div>
        </div>
      </aside>
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-20 items-center border-b border-border/80 bg-background/88 px-5 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            {isPlatformAdmin ? (
              <Shield className="size-4 text-primary" />
            ) : (
              <Settings2 className="size-4 text-primary" />
            )}
            <div>
              <p className="text-sm font-semibold">{actor.displayName}</p>
              <p className="text-xs text-muted-foreground">{actor.email}</p>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="outline">
              {isPlatformAdmin ? "Administrador de plataforma" : actor.role.replace("_", " ")}
            </Badge>
            <LogoutButton />
          </div>
        </header>
        <main className="p-5 sm:p-8 xl:p-10">{children}</main>
      </div>
      <div className="fixed bottom-5 right-5 hidden items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur md:flex">
        <Activity className="size-3.5 text-emerald-500" />
        <span className="font-mono text-[10px] font-semibold tracking-wider">CONTROL PLANE</span>
      </div>
    </div>
  );
}
