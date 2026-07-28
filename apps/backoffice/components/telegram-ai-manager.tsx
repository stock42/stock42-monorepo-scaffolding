"use client";

import { CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  TelegramAiAccessListResponseSchema,
  TelegramAiAccessResponseSchema,
  type TelegramAiAccess,
} from "@stock42/contracts/telegram-ai";
import { TenantListResponseSchema, type Tenant } from "@stock42/contracts/tenancy";
import { Alert, AlertDescription } from "@stock42/ui/components/alert";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@stock42/ui/components/table";
import { Bot, LoaderCircle, Plus, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { method: "POST" });
  if (!response.ok) throw new Error("No fue posible iniciar la operación segura.");
  return CsrfResponseSchema.parse(await response.json()).data.csrfToken;
}

function AccessRow({
  access,
  tenantId,
  onChanged,
  onError,
}: {
  access: TelegramAiAccess;
  tenantId: string;
  onChanged: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState(access.label);
  const [status, setStatus] = useState(access.status);
  const [pending, setPending] = useState(false);

  async function update() {
    setPending(true);
    try {
      const response = await fetch(
        `/api/telegram-ai/access/${encodeURIComponent(access.uuid)}/update`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": await csrfToken(),
          },
          body: JSON.stringify({
            tenantId,
            label,
            status,
            expectedVersion: access.version,
          }),
        },
      );
      if (!response.ok) throw new Error("No fue posible actualizar el acceso.");
      TelegramAiAccessResponseSchema.parse(await response.json());
      await onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "No fue posible actualizar el acceso.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Eliminar el acceso Telegram ${access.telegramUserId}?`)) return;
    setPending(true);
    try {
      const response = await fetch(`/api/telegram-ai/access/${encodeURIComponent(access.uuid)}`, {
        method: "DELETE",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": await csrfToken(),
        },
        body: JSON.stringify({ tenantId, expectedVersion: access.version }),
      });
      if (!response.ok) throw new Error("No fue posible eliminar el acceso.");
      await onChanged();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : "No fue posible eliminar el acceso.");
    } finally {
      setPending(false);
    }
  }

  return (
    <TableRow>
      <TableCell>
        <Input
          aria-label={`Etiqueta para ${access.telegramUserId}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          maxLength={120}
        />
      </TableCell>
      <TableCell className="font-mono text-xs">{access.telegramUserId}</TableCell>
      <TableCell>
        <div className="grid gap-1">
          <span className="text-sm">{access.actorDisplayName}</span>
          <span className="font-mono text-[10px] text-muted-foreground">{access.actorRole}</span>
        </div>
      </TableCell>
      <TableCell>
        <select
          aria-label={`Estado para ${access.telegramUserId}`}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          value={status}
          onChange={(event) => setStatus(event.target.value as "active" | "inactive")}
        >
          <option value="active">Activo</option>
          <option value="inactive">Inactivo</option>
        </select>
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label="Guardar acceso"
            disabled={pending}
            onClick={() => void update()}
          >
            {pending ? <LoaderCircle className="animate-spin" /> : <Save />}
          </Button>
          <Button
            size="icon"
            variant="destructive"
            aria-label="Eliminar acceso"
            disabled={pending}
            onClick={() => void remove()}
          >
            <Trash2 />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export function TelegramAiManager({ fixedTenantId }: { fixedTenantId: string | null }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(fixedTenantId ?? "");
  const [items, setItems] = useState<TelegramAiAccess[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const load = useCallback(async () => {
    if (!tenantId) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/telegram-ai/access?tenantId=${encodeURIComponent(tenantId)}&limit=100`,
        { cache: "no-store" },
      );
      if (!response.ok) throw new Error("No fue posible cargar los accesos Telegram.");
      const parsed = TelegramAiAccessListResponseSchema.parse(await response.json());
      setItems(parsed.data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar los accesos.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tenantId) return;
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/telegram-ai/access/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": await csrfToken(),
        },
        body: JSON.stringify({
          tenantId,
          telegramUserId: form.get("telegramUserId"),
          label: form.get("label"),
        }),
      });
      if (!response.ok) throw new Error("No fue posible crear el acceso.");
      TelegramAiAccessResponseSchema.parse(await response.json());
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear el acceso.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Bot className="size-4 text-primary" />
            <CardTitle>Autorizaciones Telegram</CardTitle>
          </div>
          <CardDescription>
            Cada ID activo opera con el tenant y la identidad del actor que lo registró.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!fixedTenantId ? (
            <div className="grid max-w-md gap-2">
              <Label htmlFor="telegramTenant">Tenant</Label>
              <select
                id="telegramTenant"
                className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                value={tenantId}
                onChange={(event) => setTenantId(event.target.value)}
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
          <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto]" onSubmit={create}>
            <div className="grid gap-2">
              <Label htmlFor="telegramLabel">Nombre de referencia</Label>
              <Input
                id="telegramLabel"
                name="label"
                placeholder="Operaciones - Juan"
                maxLength={120}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="telegramUserId">ID de usuario Telegram</Label>
              <Input
                id="telegramUserId"
                name="telegramUserId"
                inputMode="numeric"
                pattern="[0-9]{1,20}"
                placeholder="123456789"
                required
              />
            </div>
            <Button className="self-end" type="submit" disabled={pending || !tenantId}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Agregar
            </Button>
          </form>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>IDs con acceso</CardTitle>
          <CardDescription>
            Un ID solo puede estar asociado a un tenant para evitar contexto ambiguo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-36 items-center justify-center text-muted-foreground">
              <LoaderCircle className="mr-2 animate-spin" />
              Cargando accesos…
            </div>
          ) : items.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Referencia</TableHead>
                  <TableHead>Telegram ID</TableHead>
                  <TableHead>Identidad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((access) => (
                  <AccessRow
                    key={access.uuid}
                    access={access}
                    tenantId={tenantId}
                    onChanged={load}
                    onError={setError}
                  />
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="grid h-40 place-items-center rounded-lg border border-dashed border-border text-center">
              <div>
                <Bot className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="font-medium">No hay IDs autorizados</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  El polling ignorará todos los mensajes hasta agregar uno.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
