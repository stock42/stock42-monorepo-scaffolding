"use client";

import { AgentRunResponseSchema } from "@stock42/contracts/agent";
import { CsrfResponseSchema } from "@stock42/contracts/auth";
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
import { ArrowUpRight, LoaderCircle, Sparkles } from "lucide-react";
import { useState } from "react";

export function AgentPanel() {
  const [task, setTask] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function createRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        method: "POST",
        credentials: "same-origin",
      });
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());
      const response = await fetch("/api/agent/runs/create", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.data.csrfToken,
        },
        body: JSON.stringify({
          task,
          manifest: "assistant",
          idempotencyKey: crypto.randomUUID(),
          metadata: {},
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("No fue posible crear la ejecución.");
      const parsed = AgentRunResponseSchema.parse(payload);
      setRunId(parsed.data.uuid);
      setTask("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear la ejecución.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b border-border/70 bg-muted/30">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <CardTitle>Asistente DeepSeek</CardTitle>
        </div>
        <CardDescription>
          La ejecución queda encolada, aislada y respaldada en MongoDB.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
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
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline">deepseek-v4-pro · reasoning high</Badge>
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <ArrowUpRight />}
              Ejecutar
            </Button>
          </div>
          {runId ? (
            <Alert>
              <AlertDescription>
                Run <span className="font-mono text-foreground">{runId}</span> encolado.
              </AlertDescription>
            </Alert>
          ) : null}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
