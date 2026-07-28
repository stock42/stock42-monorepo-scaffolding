import { redirect } from "next/navigation";
import { TelegramAiManager } from "@/components/telegram-ai-manager";
import { requireBackofficeActor } from "@/lib/session";

export const metadata = { title: "Telegram AI" };

export default async function TelegramAiPage() {
  const actor = await requireBackofficeActor();
  if (!["platform_admin", "tenant_owner"].includes(actor.role)) redirect("/dashboard");

  return (
    <div className="grid gap-7">
      <div>
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Operación / Telegram AI
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Telegram AI</h1>
        <p className="mt-2 text-muted-foreground">
          CRUD de IDs autorizados para conversar con el agente mediante getUpdates.
        </p>
      </div>
      <TelegramAiManager fixedTenantId={actor.tenantId} />
    </div>
  );
}
