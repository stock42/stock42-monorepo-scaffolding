import { ControlShell } from "@/components/control-shell";
import { requireBackofficeActor } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const actor = await requireBackofficeActor();
  return <ControlShell actor={actor}>{children}</ControlShell>;
}
