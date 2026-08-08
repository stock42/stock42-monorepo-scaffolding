"use client";

import { CsrfResponseSchema } from "@stock42/contracts/auth";
import {
  EmailCampaignListResponseSchema,
  EmailCampaignResponseSchema,
  EmailDeliveryHealthResponseSchema,
  EmailSpoolerEntryResponseSchema,
  EmailSpoolerListResponseSchema,
  EmailTemplateListResponseSchema,
  EmailTemplateResponseSchema,
  UserGroupListResponseSchema,
  UserGroupMembersResponseSchema,
  UserGroupResponseSchema,
  type EmailCampaign,
  type EmailSpoolerEntry,
  type EmailTemplate,
  type UserGroup,
} from "@stock42/contracts/email-marketing";
import {
  TenantListResponseSchema,
  UserListResponseSchema,
  type Tenant,
  type User,
} from "@stock42/contracts/tenancy";
import { Alert, AlertDescription, AlertTitle } from "@stock42/ui/components/alert";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@stock42/ui/components/tabs";
import { Textarea } from "@stock42/ui/components/textarea";
import { AlertTriangle, LoaderCircle, Mail, Play, RefreshCw, Save, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store" });
  if (!response.ok) throw new Error("No fue posible preparar la operación segura.");
  return CsrfResponseSchema.parse(await response.json()).data.csrfToken;
}

async function parsedFetch<T>(url: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(
            (body as { error?: { message?: string } }).error?.message ?? "Operación rechazada.",
          )
        : "Operación rechazada.";
    throw new Error(message);
  }
  return schema.parse(body);
}

function formatDate(value: string | null): string {
  return value
    ? new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (["sent", "completed", "active"].includes(status)) return "default";
  if (["failed"].includes(status)) return "destructive";
  if (["pending", "scheduled", "processing", "sending"].includes(status)) return "secondary";
  return "outline";
}

function TemplateEditor({
  template,
  tenantId,
  onChanged,
  mutate,
}: {
  template: EmailTemplate;
  tenantId: string;
  onChanged: () => Promise<void>;
  mutate: <T>(
    url: string,
    schema: z.ZodType<T>,
    body: unknown,
    method?: "POST" | "PATCH",
  ) => Promise<T>;
}) {
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [saving, setSaving] = useState(false);

  async function save(status = template.status) {
    setSaving(true);
    try {
      await mutate(
        `/api/email-marketing/templates/${encodeURIComponent(template.uuid)}/update`,
        EmailTemplateResponseSchema,
        { tenantId, name, subject, body, status, expectedVersion: template.version },
        "PATCH",
      );
      await onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{template.name}</CardTitle>
          <Badge variant={statusVariant(template.status)}>{template.status}</Badge>
        </div>
        <CardDescription>
          Variables disponibles: {"{{displayName}}"} y {"{{email}}"}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Input
          aria-label={`Nombre de ${template.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <Input
          aria-label={`Asunto de ${template.name}`}
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
        <Textarea
          aria-label={`HTML de ${template.name}`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          rows={7}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => void save(template.status === "active" ? "inactive" : "active")}
          >
            {template.status === "active" ? "Desactivar" : "Activar"}
          </Button>
          <Button disabled={saving} onClick={() => void save()}>
            {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
            Guardar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function EmailMarketingManager({ fixedTenantId }: { fixedTenantId: string | null }) {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState(fixedTenantId ?? "");
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<UserGroup[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([]);
  const [spooler, setSpooler] = useState<EmailSpoolerEntry[]>([]);
  const [health, setHealth] = useState<
    z.infer<typeof EmailDeliveryHealthResponseSchema>["data"] | null
  >(null);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [members, setMembers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (fixedTenantId) return;
    let active = true;
    void parsedFetch("/api/tenants?limit=100", TenantListResponseSchema)
      .then((result) => {
        if (!active) return;
        setTenants(result.data.items);
        setTenantId((current) => current || result.data.items[0]?.uuid || "");
      })
      .catch(
        (cause) =>
          active &&
          setError(cause instanceof Error ? cause.message : "No fue posible cargar tenants."),
      );
    return () => {
      active = false;
    };
  }, [fixedTenantId]);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const query = `tenantId=${encodeURIComponent(tenantId)}&limit=100`;
      const [
        usersResult,
        groupsResult,
        templatesResult,
        campaignsResult,
        spoolerResult,
        healthResult,
      ] = await Promise.all([
        parsedFetch(
          `/api/tenants/${encodeURIComponent(tenantId)}/users?limit=100`,
          UserListResponseSchema,
        ),
        parsedFetch(`/api/email-marketing/groups?${query}`, UserGroupListResponseSchema),
        parsedFetch(`/api/email-marketing/templates?${query}`, EmailTemplateListResponseSchema),
        parsedFetch(`/api/email-marketing/campaigns?${query}`, EmailCampaignListResponseSchema),
        parsedFetch(`/api/email-marketing/spooler?${query}`, EmailSpoolerListResponseSchema),
        parsedFetch(
          `/api/email-marketing/spooler/health?tenantId=${encodeURIComponent(tenantId)}`,
          EmailDeliveryHealthResponseSchema,
        ),
      ]);
      setUsers(usersResult.data.items.filter((user) => user.status === "active"));
      setGroups(groupsResult.data.items);
      setTemplates(templatesResult.data.items);
      setCampaigns(campaignsResult.data.items);
      setSpooler(spoolerResult.data.items);
      setHealth(healthResult.data);
      setSelectedGroupId((current) =>
        groupsResult.data.items.some((group) => group.uuid === current)
          ? current
          : groupsResult.data.items[0]?.uuid || "",
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar email marketing.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  const loadMembers = useCallback(async () => {
    if (!tenantId || !selectedGroupId) {
      setMembers([]);
      return;
    }
    try {
      const result = await parsedFetch(
        `/api/email-marketing/groups/${encodeURIComponent(selectedGroupId)}/members?tenantId=${encodeURIComponent(tenantId)}&limit=100`,
        UserGroupMembersResponseSchema,
      );
      setMembers(result.data.items);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible cargar miembros.");
    }
  }, [selectedGroupId, tenantId]);

  useEffect(() => {
    const timer = setTimeout(() => void loadMembers(), 0);
    return () => clearTimeout(timer);
  }, [loadMembers]);

  async function mutate<T>(
    url: string,
    schema: z.ZodType<T>,
    body: unknown,
    method: "POST" | "PATCH" | "DELETE" = "POST",
  ): Promise<T> {
    setError(null);
    try {
      return await parsedFetch(url, schema, {
        method,
        headers: { "content-type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Operación rechazada.";
      setError(message);
      throw cause;
    }
  }

  async function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await mutate("/api/email-marketing/groups/create", UserGroupResponseSchema, {
        tenantId,
        name: form.get("name"),
        description: form.get("description"),
        userIds: form.getAll("userIds"),
      });
      event.currentTarget.reset();
      await load();
    } finally {
      setPending(false);
    }
  }

  async function toggleGroup(group: UserGroup) {
    await mutate(
      `/api/email-marketing/groups/${encodeURIComponent(group.uuid)}/update`,
      UserGroupResponseSchema,
      {
        tenantId,
        name: group.name,
        description: group.description,
        status: group.status === "active" ? "inactive" : "active",
        expectedVersion: group.version,
      },
      "PATCH",
    );
    await load();
  }

  async function addMembers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/email-marketing/groups/${encodeURIComponent(selectedGroupId)}/members/add`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify({ tenantId, userIds: form.getAll("userIds") }),
      },
    );
    if (!response.ok) {
      setError("No fue posible agregar los miembros.");
      return;
    }
    event.currentTarget.reset();
    await Promise.all([load(), loadMembers()]);
  }

  async function removeMember(userId: string) {
    const response = await fetch(
      `/api/email-marketing/groups/${encodeURIComponent(selectedGroupId)}/members/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: { "content-type": "application/json", "x-csrf-token": await csrfToken() },
        body: JSON.stringify({ tenantId }),
      },
    );
    if (!response.ok) {
      setError("No fue posible quitar el miembro.");
      return;
    }
    await Promise.all([load(), loadMembers()]);
  }

  async function createTemplate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await mutate("/api/email-marketing/templates/create", EmailTemplateResponseSchema, {
        tenantId,
        name: form.get("name"),
        subject: form.get("subject"),
        body: form.get("body"),
      });
      event.currentTarget.reset();
      await load();
    } finally {
      setPending(false);
    }
  }

  async function createCampaign(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    const form = new FormData(event.currentTarget);
    try {
      await mutate("/api/email-marketing/campaigns/create", EmailCampaignResponseSchema, {
        tenantId,
        name: form.get("name"),
        templateId: form.get("templateId"),
        groupId: form.get("groupId"),
        scheduledAt: new Date(String(form.get("scheduledAt"))).toISOString(),
        idempotencyKey: crypto.randomUUID(),
      });
      event.currentTarget.reset();
      await load();
    } finally {
      setPending(false);
    }
  }

  async function stopCampaign(campaign: EmailCampaign) {
    await mutate(
      `/api/email-marketing/campaigns/${encodeURIComponent(campaign.uuid)}/stop`,
      EmailCampaignResponseSchema,
      { tenantId },
    );
    await load();
  }

  async function spoolerAction(entry: EmailSpoolerEntry, action: "send-now" | "stop") {
    await mutate(
      `/api/email-marketing/spooler/${encodeURIComponent(entry.uuid)}/${action}`,
      EmailSpoolerEntryResponseSchema,
      { tenantId },
    );
    await load();
  }

  const availableMembers = users.filter(
    (user) => !members.some((member) => member.uuid === user.uuid),
  );

  return (
    <div className="grid gap-6">
      {!fixedTenantId ? (
        <Card>
          <CardHeader>
            <CardTitle>Tenant operativo</CardTitle>
            <CardDescription>
              Toda campaña y audiencia queda aislada en este tenant.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Label htmlFor="marketingTenant">Tenant</Label>
            <select
              id="marketingTenant"
              className="mt-2 h-10 w-full max-w-md rounded-md border border-input bg-background px-3"
              value={tenantId}
              onChange={(event) => setTenantId(event.target.value)}
            >
              {tenants.map((tenant) => (
                <option key={tenant.uuid} value={tenant.uuid}>
                  {tenant.name}
                </option>
              ))}
            </select>
          </CardContent>
        </Card>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader>
            <CardDescription>Transporte</CardDescription>
            <CardTitle>{health?.enabled ? "Activo" : "Deshabilitado"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {health?.configured ? health.from : "SMTP sin configurar"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cola pendiente</CardDescription>
            <CardTitle>{health?.pending ?? 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {health?.processing ?? 0} en proceso
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Fallos terminales</CardDescription>
            <CardTitle>{health?.failed ?? 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}Actualizar
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="campaigns">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="campaigns">Campañas</TabsTrigger>
          <TabsTrigger value="groups">Grupos</TabsTrigger>
          <TabsTrigger value="templates">Plantillas</TabsTrigger>
          <TabsTrigger value="spooler">Spooler</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="grid gap-5 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Nueva campaña</CardTitle>
              <CardDescription>
                Crea una copia renderizada por usuario y la programa en la cola persistente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4 lg:grid-cols-4" onSubmit={createCampaign}>
                <div className="grid gap-2">
                  <Label htmlFor="campaignName">Nombre</Label>
                  <Input id="campaignName" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaignTemplate">Plantilla</Label>
                  <select
                    id="campaignTemplate"
                    name="templateId"
                    required
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    {templates
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.uuid} value={item.uuid}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaignGroup">Grupo</Label>
                  <select
                    id="campaignGroup"
                    name="groupId"
                    required
                    className="h-10 rounded-md border border-input bg-background px-3"
                  >
                    {groups
                      .filter((item) => item.status === "active")
                      .map((item) => (
                        <option key={item.uuid} value={item.uuid}>
                          {item.name} ({item.memberCount})
                        </option>
                      ))}
                  </select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="campaignSchedule">Programación</Label>
                  <Input id="campaignSchedule" name="scheduledAt" type="datetime-local" required />
                </div>
                <Button className="lg:col-start-4" disabled={pending || !health?.from}>
                  <Mail />
                  Programar campaña
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Historial de campañas</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaña</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Programada</TableHead>
                    <TableHead>Entrega</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.uuid}>
                      <TableCell className="font-medium">{campaign.name}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(campaign.status)}>{campaign.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDate(campaign.scheduledAt)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {campaign.summary.sent}/{campaign.summary.total} · {campaign.summary.failed}{" "}
                        fallidos
                      </TableCell>
                      <TableCell className="text-right">
                        {["scheduled", "sending", "failed"].includes(campaign.status) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void stopCampaign(campaign)}
                          >
                            <Square />
                            Detener
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="groups" className="grid gap-5 pt-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nuevo grupo manual</CardTitle>
              <CardDescription>
                Seleccioná usuarios reales del tenant; no se aceptan identidades externas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={createGroup}>
                <div className="grid gap-2">
                  <Label htmlFor="groupName">Nombre</Label>
                  <Input id="groupName" name="name" required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="groupDescription">Descripción</Label>
                  <Textarea id="groupDescription" name="description" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="groupUsers">Usuarios iniciales</Label>
                  <select
                    id="groupUsers"
                    name="userIds"
                    multiple
                    className="min-h-36 rounded-md border border-input bg-background p-2"
                  >
                    {users.map((user) => (
                      <option key={user.uuid} value={user.uuid}>
                        {user.displayName} · {user.email}
                      </option>
                    ))}
                  </select>
                </div>
                <Button disabled={pending}>Crear grupo</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Grupos disponibles</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {groups.map((group) => (
                <div
                  key={group.uuid}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">{group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {group.memberCount} miembros · {group.description || "Sin descripción"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusVariant(group.status)}>{group.status}</Badge>
                    <Button variant="outline" size="sm" onClick={() => void toggleGroup(group)}>
                      {group.status === "active" ? "Desactivar" : "Activar"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Miembros del grupo</CardTitle>
              <CardDescription>Altas idempotentes y bajas auditadas.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <select
                aria-label="Grupo a administrar"
                className="h-10 max-w-md rounded-md border border-input bg-background px-3"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
              >
                {groups.map((group) => (
                  <option key={group.uuid} value={group.uuid}>
                    {group.name}
                  </option>
                ))}
              </select>
              <form className="flex flex-wrap items-end gap-3" onSubmit={addMembers}>
                <div className="grid min-w-72 flex-1 gap-2">
                  <Label htmlFor="memberUsers">Agregar usuarios</Label>
                  <select
                    id="memberUsers"
                    name="userIds"
                    multiple
                    required
                    className="min-h-28 rounded-md border border-input bg-background p-2"
                  >
                    {availableMembers.map((user) => (
                      <option key={user.uuid} value={user.uuid}>
                        {user.displayName} · {user.email}
                      </option>
                    ))}
                  </select>
                </div>
                <Button disabled={!selectedGroupId}>Agregar</Button>
              </form>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuario</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((member) => (
                    <TableRow key={member.uuid}>
                      <TableCell>{member.displayName}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void removeMember(member.uuid)}
                        >
                          Quitar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates" className="grid gap-5 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Nueva plantilla HTML</CardTitle>
              <CardDescription>
                Los valores de usuario se escapan antes de inyectarse en el HTML.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-4" onSubmit={createTemplate}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="templateName">Nombre</Label>
                    <Input id="templateName" name="name" required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="templateSubject">Asunto</Label>
                    <Input id="templateSubject" name="subject" required />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="templateBody">HTML</Label>
                  <Textarea id="templateBody" name="body" rows={10} required />
                </div>
                <Button className="justify-self-end" disabled={pending}>
                  Crear plantilla
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {templates.map((template) => (
              <TemplateEditor
                key={template.uuid}
                template={template}
                tenantId={tenantId}
                onChanged={load}
                mutate={mutate}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="spooler" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cola de entrega</CardTitle>
              <CardDescription>
                El envío inmediato sólo adelanta la programación; el worker conserva lease y
                reintentos.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Destino</TableHead>
                    <TableHead>Asunto</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Intentos</TableHead>
                    <TableHead>Programado</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {spooler.map((entry) => (
                    <TableRow key={entry.uuid}>
                      <TableCell>{entry.to}</TableCell>
                      <TableCell className="max-w-64 truncate">{entry.subject}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
                        {entry.lastError ? (
                          <p
                            className="mt-1 max-w-72 truncate text-xs text-destructive"
                            title={entry.lastError}
                          >
                            {entry.lastError}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>{entry.attempts}</TableCell>
                      <TableCell>{formatDate(entry.scheduledAt)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {["pending", "failed"].includes(entry.status) ? (
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label="Enviar ahora"
                              onClick={() => void spoolerAction(entry, "send-now")}
                            >
                              <Play />
                            </Button>
                          ) : null}
                          {["pending", "failed"].includes(entry.status) ? (
                            <Button
                              size="icon"
                              variant="outline"
                              aria-label="Detener email"
                              onClick={() => void spoolerAction(entry, "stop")}
                            >
                              <Square />
                            </Button>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
