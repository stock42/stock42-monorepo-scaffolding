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
import { Input } from "@stock42/ui/components/input";
import { Label } from "@stock42/ui/components/label";
import { ArrowUpRight, Ban, LoaderCircle, Radio, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

export function AgentPanel() {
  const [task, setTask] = useState("");
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [run, setRun] = useState<AgentRun | null>(null);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const [realtimeState, setRealtimeState] = useState<RealtimeConnectionState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const cursorRef = useRef(0);
  const realtimeClientRef = useRef<AgentRealtimeClient | null>(null);
  const activeRunId = run?.uuid;
  const activeRunTerminal = run ? terminalStatuses.has(run.status) : false;

  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  useEffect(() => {
    if (!activeRunId || activeRunTerminal) return;
    const runId = activeRunId;
    const channel = `agent:run:${runId}`;
    let active = true;

    async function refreshRun() {
      const response = await fetch(`/api/agent/runs/${encodeURIComponent(runId)}`, {
        cache: "no-store",
      });
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
    client.subscribe(channel, { cursor: cursorRef.current });
    client.start();

    return () => {
      active = false;
      client.stop();
      if (realtimeClientRef.current === client) realtimeClientRef.current = null;
    };
  }, [activeRunId, activeRunTerminal]);

  useEffect(() => {
    if (!activeRunId || activeRunTerminal || realtimeState === "open") return;
    const runId = activeRunId;
    const channel = `agent:run:${runId}`;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function refreshFallback() {
      try {
        const [runResponse, eventsResponse] = await Promise.all([
          fetch(`/api/agent/runs/${encodeURIComponent(runId)}`, { cache: "no-store" }),
          fetch(`/api/agent/runs/${encodeURIComponent(runId)}/events?cursor=${cursorRef.current}`, {
            cache: "no-store",
          }),
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
  }, [activeRunId, activeRunTerminal, realtimeState]);

  async function createRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
          ...(conversationId ? { conversationId } : {}),
          task,
          manifest: "assistant",
          idempotencyKey: crypto.randomUUID(),
          metadata: { channel: "webapp-realtime" },
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("No fue posible crear la ejecución.");
      const created = AgentRunResponseSchema.parse(payload).data;
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

  async function cancelRun() {
    if (!run) return;
    try {
      const response = await fetch(`/api/agent/runs/${encodeURIComponent(run.uuid)}/cancel`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": await csrfToken(),
        },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("No fue posible cancelar el run.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cancelar el run.");
    }
  }

  const answer = responseAnswer(run);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle>Asistente DeepSeek</CardTitle>
        </div>
        <CardDescription>
          Ejecución durable con eventos en tiempo real y replay automático.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 pt-6">
        <form className="grid gap-4" onSubmit={createRun}>
          <div className="grid gap-2">
            <Label htmlFor="task">¿Qué necesitás resolver?</Label>
            <Input
              id="task"
              value={task}
              onChange={(event) => setTask(event.target.value)}
              placeholder="Prepará un resumen de actividad..."
              minLength={1}
              required
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="flex flex-wrap gap-2">
              <Badge variant="outline">deepseek-v4-pro · reasoning high</Badge>
              {run ? (
                <Badge variant={realtimeState === "open" ? "success" : "secondary"}>
                  <Radio />
                  {realtimeState === "open" ? "WebSocket" : "Replay HTTP"}
                </Badge>
              ) : null}
            </span>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
              Ejecutar
            </Button>
          </div>
        </form>

        {run ? (
          <div className="grid gap-3 rounded-lg border border-border p-4 text-sm">
            <span className="break-all font-mono text-xs text-muted-foreground">{run.uuid}</span>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={run.status === "succeeded" ? "success" : "secondary"}>
                {run.status}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {events.length} eventos · intento {run.attempt}
              </span>
            </div>
            {!terminalStatuses.has(run.status) ? (
              <Button className="w-fit" variant="outline" onClick={() => void cancelRun()}>
                <Ban />
                Cancelar run
              </Button>
            ) : null}
          </div>
        ) : null}

        {answer ? (
          <div className="rounded-lg border border-border bg-muted/25 p-5">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-primary">
              Respuesta
            </p>
            <p className="whitespace-pre-wrap text-sm leading-6">{answer}</p>
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
