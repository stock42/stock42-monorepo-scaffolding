"use client";

import { AuthResponseSchema, CsrfResponseSchema } from "@stock42/contracts/auth";
import { Alert, AlertDescription } from "@stock42/ui/components/alert";
import { Button } from "@stock42/ui/components/button";
import { Input } from "@stock42/ui/components/input";
import { Label } from "@stock42/ui/components/label";
import { ArrowRight, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const [actorKind, setActorKind] = useState<"administrator" | "operator">("administrator");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        method: "POST",
        credentials: "same-origin",
      });
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());
      const response = await fetch("/api/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.data.csrfToken,
        },
        body: JSON.stringify({
          actorKind,
          email: form.get("email"),
          password: form.get("password"),
          tenantSlug: actorKind === "operator" ? form.get("tenantSlug") : undefined,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "No fue posible iniciar sesión.";
        throw new Error(message);
      }
      AuthResponseSchema.parse(payload);
      router.replace("/dashboard");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
        <Button
          type="button"
          size="sm"
          variant={actorKind === "administrator" ? "default" : "ghost"}
          onClick={() => setActorKind("administrator")}
        >
          Plataforma
        </Button>
        <Button
          type="button"
          size="sm"
          variant={actorKind === "operator" ? "default" : "ghost"}
          onClick={() => setActorKind("operator")}
        >
          Tenant
        </Button>
      </div>
      {actorKind === "operator" ? (
        <div className="grid gap-2">
          <Label htmlFor="tenantSlug">Tenant</Label>
          <Input id="tenantSlug" name="tenantSlug" placeholder="acme-argentina" required />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="admin@stock42.com"
          required
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}
        Abrir control
      </Button>
    </form>
  );
}
