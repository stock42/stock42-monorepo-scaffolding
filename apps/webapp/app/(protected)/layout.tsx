import { Badge } from "@stock42/ui/components/badge";
import { Separator } from "@stock42/ui/components/separator";
import { Activity, Blocks, CircleUserRound } from "lucide-react";
import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireUser();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 sm:px-8">
          <Link href="/dashboard" className="flex items-center gap-3 font-semibold">
            <span className="grid size-9 place-items-center rounded-md bg-[#09111f] text-white">
              S42
            </span>
            <span>Workspace</span>
          </Link>
          <Separator orientation="vertical" className="hidden h-6 sm:block" />
          <nav className="hidden items-center gap-1 text-sm sm:flex">
            <Link className="rounded-md bg-accent px-3 py-2 font-medium" href="/dashboard">
              <Activity className="mr-2 inline size-4" />
              Actividad
            </Link>
            <span className="px-3 py-2 text-muted-foreground">
              <Blocks className="mr-2 inline size-4" />
              Módulos
            </span>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium">{actor.displayName}</p>
              <p className="text-xs text-muted-foreground">{actor.email}</p>
            </div>
            <CircleUserRound className="size-5 text-muted-foreground" />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">{children}</main>
      <div className="fixed bottom-5 left-5 hidden items-center gap-2 rounded-full border border-border bg-background/90 px-3 py-1.5 shadow-sm backdrop-blur md:flex">
        <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
        <Badge variant="outline" className="border-0 p-0 font-mono text-[10px]">
          TENANT CONNECTED
        </Badge>
      </div>
    </div>
  );
}
