"use client";

import { CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  TenantListResponseSchema,
  TenantResponseSchema,
  type Tenant,
} from "@stock42/contracts/tenancy";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@stock42/ui/components/table";
import { ArrowRight, Building2, LoaderCircle, Plus } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export function TenantManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tenants?limit=50", { cache: "no-store" });
      if (!response.ok) throw new Error("No fue posible cargar los tenants.");
      const payload = TenantListResponseSchema.parse(await response.json());
      setTenants(payload.data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar los tenants.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  async function createTenant(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", { method: "POST" });
      const csrf = CsrfResponseSchema.parse(await csrfResponse.json());
      const response = await fetch("/api/tenants/create", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.data.csrfToken,
        },
        body: JSON.stringify({
          name: form.get("name"),
          slug: form.get("slug"),
          owner: {
            email: form.get("ownerEmail"),
            displayName: form.get("ownerName"),
            password: form.get("ownerPassword"),
          },
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) throw new Error("No fue posible crear el tenant.");
      TenantResponseSchema.parse(payload);
      event.currentTarget.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible crear el tenant.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Card>
        <CardHeader>
          <CardTitle>Tenants registrados</CardTitle>
          <CardDescription>Owner, estado y acceso a cada entorno aislado.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <LoaderCircle className="mr-2 animate-spin" />
              Cargando tenants…
            </div>
          ) : tenants.length === 0 ? (
            <div className="grid h-48 place-items-center rounded-lg border border-dashed border-border text-center">
              <div>
                <Building2 className="mx-auto mb-3 size-7 text-muted-foreground" />
                <p className="font-medium">Todavía no hay tenants</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creá el primero desde este panel.
                </p>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants.map((tenant) => (
                  <TableRow key={tenant.uuid}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {tenant.slug}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tenant.status === "active" ? "success" : "secondary"}>
                        {tenant.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        render={<Link href={`/tenants/${tenant.uuid}`} />}
                        size="sm"
                        variant="ghost"
                      >
                        Abrir <ArrowRight />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Plus className="size-4 text-primary" />
            <CardTitle>Nuevo tenant</CardTitle>
          </div>
          <CardDescription>La operación crea y asigna el owner de forma atómica.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={createTenant}>
            <div className="grid gap-2">
              <Label htmlFor="name">Nombre</Label>
              <Input id="name" name="name" placeholder="Acme Argentina" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" name="slug" placeholder="acme-argentina" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownerName">Nombre del owner</Label>
              <Input id="ownerName" name="ownerName" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownerEmail">Email del owner</Label>
              <Input id="ownerEmail" name="ownerEmail" type="email" required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ownerPassword">Contraseña inicial</Label>
              <Input
                id="ownerPassword"
                name="ownerPassword"
                type="password"
                minLength={12}
                required
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="animate-spin" /> : <Plus />}
              Crear tenant
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
