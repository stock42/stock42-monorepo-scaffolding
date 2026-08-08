"use client";

import {
  AgentRunEventsResponseSchema,
  AgentRunEventSchema,
  AgentRunResponseSchema,
  type AgentRun,
  type AgentRunEvent,
} from "@stock42/contracts/agent";
import { CsrfResponseSchema } from "@stock42/contracts/auth";
import { AgentRealtimeClient, type RealtimeConnectionState } from "@stock42/api-client/realtime";
import { TenantListResponseSchema, type Tenant } from "@stock42/contracts/tenancy";
import { Alert, AlertDescription } from "@stock42/ui/components/alert";
import { Badge } from "@stock42/ui/components/badge";
import { Button } from "@stock42/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@stock42/ui/components/card";
import { Label } from "@stock42/ui/components/label";
import { Ban, Check, LoaderCircle, Radio, Send, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const terminalStatuses = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
  "killed",
  "crashed",
]);

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    method: "POST",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("No fue posible iniciar la operación segura.");
  return CsrfResponseSchema.parse(await response.json()).data.csrfToken;
}

function responseAnswer(run: AgentRun | null): string | null {
  if (!run || typeof run.output !== "object" || run.output === null) return null;
  const answer = (run.output as Record<string, unknown>).answer;
  return typeof answer === "string" ? answer : null;
}

export function BackofficeAgentPanel({ fixedTenantId }: { fixedTenantId: string | null }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(fixedTenantId ?? "");
  const [task, setTask] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("idle");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRunId = run?.uuid;
  const activeRunTerminal = run ? terminalStatuses.has(run.status) : false;
  const cursorRef = useRef(0);
  const realtimeClientRef = useRef<AgentRealtimeClient | null>(null);

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (fixedTenantId) return;
    let active = true;
    void fetch("/api/tenants?limit=100", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("No fue posible cargar los tenants.");
        const parsed = TenantListResponseSchema.parse(await response.json());
        if (!active) return;
        setTenants(parsed.data.items);
        setTenantId((current) => current || parsed.data.items[0]?.uuid || "");
      })
      .catch((cause) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "No fue posible cargar los tenants.");
        }
      });
    return () => {
      active = false;
    };
  }, [fixedTenantId]);

  useEffect(() => {
    if (!activeRunId || !tenantId) return;
    const runId = activeRunId;
    let active = true;
    const channel = `agent:run:${runId}`;

    async function refreshRun() {
      const response = await fetch(
        `/api/agent/runs/${encodeURIComponent(runId)}?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("No fue posible actualizar el run.");
      const nextRun = AgentRunResponseSchema.parse(await response.json()).data;
      if (!active) return;
      setRun(nextRun);
      if (terminalStatuses.has(nextRun.status)) client.stop();
    }

    const client = new AgentRealtimeClient({
      onStateChange: (state) => {
        if (active) setRealtimeState(state);
      },
      onError: (message) => {
        if (active) setError(message);
      },
      onEvent: (message) => {
        if (!active) return;
        const event = AgentRunEventSchema.parse(message.payload);
        setEvents((current) =>
          current.some((item) => item.uuid === event.uuid)
            ? current
            : [...current, event].sort((left, right) => left.sequence - right.sequence),
        );
        cursorRef.current = message.cursor;
        setCursor(message.cursor);
        void refreshRun().catch(() => {
          if (active) setError("No fue posible actualizar el estado del run.");
        });
      },
    });
    realtimeClientRef.current = client;
    client.subscribe(channel, { cursor: cursorRef.current, tenantId });
    client.start();

    return () => {
      active = false;
      client.stop();
      if (realtimeClientRef.current === client) realtimeClientRef.current = null;
    };
  }, [activeRunId, tenantId]);

  useEffect(() => {
    if (!activeRunId || !tenantId || realtimeState === "open" || activeRunTerminal) {
      return;
    }
    const runId = activeRunId;
    const channel = `agent:run:${runId}`;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshFallback() {
      try {
        const [runResponse, eventsResponse] = await Promise.all([
          fetch(
            `/api/agent/runs/${encodeURIComponent(runId)}?tenantId=${encodeURIComponent(tenantId)}`,
            { cache: "no-store" },
          ),
          fetch(
            `/api/agent/runs/${encodeURIComponent(runId)}/events?tenantId=${encodeURIComponent(tenantId)}&cursor=${cursorRef.current}`,
            { cache: "no-store" },
          ),
        ]);
        if (!runResponse.ok || !eventsResponse.ok) {
          throw new Error("No fue posible actualizar el run.");
        }
        const nextRun = AgentRunResponseSchema.parse(await runResponse.json()).data;
        const nextEvents = AgentRunEventsResponseSchema.parse(await eventsResponse.json()).data;
        if (!active) return;
        setRun(nextRun);
        if (nextEvents.events.length) {
          setEvents((current) => {
            const known = new Set(current.map((item) => item.uuid));
            return [...current, ...nextEvents.events.filter((item) => !known.has(item.uuid))].sort(
              (left, right) => left.sequence - right.sequence,
            );
          });
        }
        cursorRef.current = nextEvents.nextCursor;
        setCursor(nextEvents.nextCursor);
        realtimeClientRef.current?.advanceCursor(channel, nextEvents.nextCursor);
        if (!terminalStatuses.has(nextRun.status)) timer = setTimeout(refreshFallback, 3_000);
      } catch (cause) {
        if (active) {
          setError(cause instanceof Error ? cause.message : "No fue posible actualizar el run.");
          timer = setTimeout(refreshFallback, 3_000);
        }
      }
    }

    timer = setTimeout(refreshFallback, 750);
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [activeRunId, activeRunTerminal, realtimeState, tenantId]);

  const pendingConfirmations = useMemo(() => {
    const pendingItems = new Map<
      string,
      { id: string; toolName: string | null; preview: Record<string, unknown> | null }
    >();
    for (const event of events) {
      const confirmationId =
        typeof event.payload.confirmationId === "string" ? event.payload.confirmationId : null;
      if (!confirmationId) continue;
      if (event.type === "confirmation.required") {
        pendingItems.set(confirmationId, {
          id: confirmationId,
          toolName: typeof event.payload.toolName === "string" ? event.payload.toolName : null,
          preview:
            typeof event.payload.preview === "object" && event.payload.preview !== null
              ? (event.payload.preview as Record<string, unknown>)
              : null,
        });
      }
      if (event.type === "confirmation.resolved") pendingItems.delete(confirmationId);
    }
    return [...pendingItems.values()];
  }, [events]);

  function changeTenant(value: string) {
    setTenantId(value);
    setConversationId(null);
    setRun(null);
    setEvents([]);
    setCursor(0);
    setRealtimeState("idle");
  }

  async function createRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/agent/runs/create", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": await csrfToken(),
        },
        body: JSON.stringify({
          tenantId,
          ...(conversationId ? { conversationId } : {}),
          task,
          manifest: "assistant",
          idempotencyKey: crypto.randomUUID(),
          metadata: { channel: "backoffice-http" },
        }),
      });
      if (!response.ok) throw new Error("No fue posible crear la ejecución.");
      const created = AgentRunResponseSchema.parse(await response.json()).data;
      setRun(created);
      setConversationId(created.conversationId);
      setEvents([]);
      setCursor(0);
      setRealtimeState("connecting");
      setTask("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear la ejecución.");
    } finally {
      setPending(false);
    }
  }

  async function mutate(path: string, body: Record<string, unknown>) {
    setError(null);
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "content-type": "application/json",
        "x-csrf-token": await csrfToken(),
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error("No fue posible completar la operación.");
  }

  async function resolveConfirmation(id: string, decision: "approve" | "reject") {
    try {
      await mutate(`/api/agent/confirmations/${encodeURIComponent(id)}/${decision}`, {
        tenantId,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible resolver la confirmación.");
    }
  }

  async function cancelRun() {
    if (!run) return;
    try {
      await mutate(`/api/agent/runs/${encodeURIComponent(run.uuid)}/cancel`, { tenantId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cancelar el run.");
    }
  }

  const answer = responseAnswer(run);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border/70 bg-muted/30">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <CardTitle>Agente del backoffice</CardTitle>
          </div>
          <CardDescription>
            Tiempo real nativo con replay durable sobre el mismo runtime que atiende Telegram.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          {!fixedTenantId ? (
            <div className="grid gap-2">
              <Label htmlFor="agentTenant">Tenant</Label>
              <select
                id="agentTenant"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={tenantId}
                onChange={(event) => changeTenant(event.target.value)}
                required
              >
                <option value="">Seleccionar tenant</option>
                {tenants.map((tenant) => (
                  <option key={tenant.uuid} value={tenant.uuid}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <form className="grid gap-3" onSubmit={createRun}>
            <Label htmlFor="agentTask">Consulta</Label>
            <textarea
              id="agentTask"
              className="min-h-36 resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Consultá o solicitá una operación para el tenant seleccionado…"
              maxLength={20_000}
              required
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Badge variant="outline">deepseek-v4-pro · durable</Badge>
              <Button type="submit" disabled={pending || !tenantId}>
                {pending ? <LoaderCircle className="animate-spin" /> : <Send />}
                Enviar
              </Button>
            </div>
          </form>
          {answer ? (
            <div className="rounded-lg border border-border bg-muted/25 p-5">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-primary">
                Respuesta
              </p>
              <p className="whitespace-pre-wrap text-sm leading-6">{answer}</p>
            </div>
          ) : null}
          {pendingConfirmations.map((confirmation) => (
            <Alert key={confirmation.id}>
              <AlertDescription className="grid gap-3">
                <div className="grid gap-1 text-sm">
                  <span className="font-medium">
                    Operación crítica pendiente
                    {confirmation.toolName ? `: ${confirmation.toolName}` : ""}
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {confirmation.id}
                  </span>
                  {confirmation.preview ? (
                    <dl className="mt-2 grid gap-1 rounded-md border border-border/70 bg-muted/30 p-3 text-xs">
                      {Object.entries(confirmation.preview).map(([key, value]) => (
                        <div key={key} className="grid grid-cols-[130px_1fr] gap-2">
                          <dt className="font-medium text-muted-foreground">{key}</dt>
                          <dd className="break-all">{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </div>
                <span className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void resolveConfirmation(confirmation.id, "approve")}
                  >
                    <Check />
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void resolveConfirmation(confirmation.id, "reject")}
                  >
                    <X />
                    Rechazar
                  </Button>
                </span>
              </AlertDescription>
            </Alert>
          ))}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Estado del run</CardTitle>
          <CardDescription className="flex items-center gap-2">
            <Radio className="size-3.5" />
            {realtimeState === "open"
              ? "WebSocket conectado"
              : "Reconectando · replay HTTP de respaldo"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {run ? (
            <>
              <div className="grid gap-2 rounded-lg border border-border p-4 text-sm">
                <span className="font-mono text-xs text-muted-foreground">{run.uuid}</span>
                <Badge variant={run.status === "succeeded" ? "success" : "secondary"}>
                  {run.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {events.length} eventos · intento {run.attempt}
                </span>
              </div>
              {!terminalStatuses.has(run.status) ? (
                <Button variant="outline" onClick={() => void cancelRun()}>
                  <Ban />
                  Cancelar run
                </Button>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Enviá una consulta para iniciar una conversación durable.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
