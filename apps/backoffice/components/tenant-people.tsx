"use client";

import { CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  OperatorListResponseSchema,
  OperatorResponseSchema,
  UserListResponseSchema,
  UserResponseSchema,
  type Operator,
  type User,
} from "@stock42/contracts/tenancy";
import { Alert, AlertDescription } from "@stock42/ui/components/alert";
import { Badge } from "@stock42/ui/components/badge";
import { Button } from "@stock42/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@stock42/ui/components/card";
import { Input } from "@stock42/ui/components/input";
import { Label } from "@stock42/ui/components/label";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type PeopleKind = "operators" | "users";

export function TenantPeople({ tenantId }: { tenantId: string }) {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [operatorResponse, userResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/operators?limit=50`, { cache: "no-store" }),
        fetch(`/api/tenants/${tenantId}/users?limit=50`, { cache: "no-store" }),
      ]);
      if (!operatorResponse.ok || !userResponse.ok)
        throw new Error("No fue posible cargar personas.");
      setOperators(OperatorListResponseSchema.parse(await operatorResponse.json()).data.items);
      setUsers(UserListResponseSchema.parse(await userResponse.json()).data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar personas.");
    }
  }, [tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function createPerson(kind: PeopleKind, event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { method: "POST" });
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());
      const response = await fetch(`/api/tenants/${tenantId}/${kind}/create`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.data.csrfToken,
        },
        body: JSON.stringify({
          email: form.get("email"),
          displayName: form.get("displayName"),
          password: form.get("password"),
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok)
        throw new Error(`No fue posible crear ${kind === "users" ? "el usuario" : "el operador"}.`);
      (kind === "users" ? UserResponseSchema : OperatorResponseSchema).parse(payload);
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear la identidad.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      {[
        { kind: "operators" as const, title: "Operadores", people: operators },
        { kind: "users" as const, title: "Usuarios", people: users },
      ].map(({ kind, title, people }) => (
        <Card key={kind}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              {title}
              <Badge variant="outline">{people.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-5">
            <div className="grid gap-2">
              {people.length === 0 ? (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  No hay {title.toLowerCase()} adicionales.
                </p>
              ) : (
                people.map((person) => (
                  <div
                    key={person.uuid}
                    className="flex items-center justify-between rounded-md border border-border/70 p-3"
                  >
                    <div>
                      <p className="text-sm font-medium">{person.displayName}</p>
                      <p className="text-xs text-muted-foreground">{person.email}</p>
                    </div>
                    <Badge variant={person.status === "active" ? "success" : "secondary"}>
                      {"role" in person ? person.role : person.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
            <form
              className="grid gap-3 border-t border-border pt-5"
              onSubmit={(event) => createPerson(kind, event)}
            >
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-name`}>Nombre</Label>
                <Input id={`${kind}-name`} name="displayName" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-email`}>Email</Label>
                <Input id={`${kind}-email`} name="email" type="email" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-password`}>Contraseña inicial</Label>
                <Input
                  id={`${kind}-password`}
                  name="password"
                  type="password"
                  minLength={12}
                  required
                />
              </div>
              <Button type="submit" variant="secondary">
                <Plus />
                Agregar {kind === "users" ? "usuario" : "operador"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ))}
      {error ? (
        <Alert variant="destructive" className="xl:col-span-2">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
