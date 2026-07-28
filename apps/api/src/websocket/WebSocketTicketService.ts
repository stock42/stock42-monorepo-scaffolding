import type { SessionActor } from "@stock42/contracts/auth";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Collection } from "mongodb";
import type { ApiConfig } from "@/config";
import { HttpError } from "@/errors/HttpError";

type TicketPayload = {
  nonce: string;
  actor: SessionActor;
  expiresAt: string;
};

type TicketDocument = {
  hash: string;
  actor: SessionActor;
  tenantId: string | null;
  expiresAt: Date;
  createdAt: Date;
  usedAt: Date | null;
};

function hashTicket(ticket: string): string {
  return createHash("sha256").update(ticket).digest("hex");
}

export class WebSocketTicketService {
  constructor(
    private readonly collection: Collection<TicketDocument>,
    private readonly config: ApiConfig,
  ) {}

  async ensureIndexes(): Promise<void> {
    await Promise.all([
      this.collection.createIndex({ hash: 1 }, { unique: true, name: "ws_ticket_hash_unique" }),
      this.collection.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0, name: "ws_ticket_expiry_ttl" },
      ),
    ]);
  }

  async create(actor: SessionActor): Promise<{ ticket: string; expiresAt: string }> {
    const expiresAt = new Date(Date.now() + 60_000);
    const payload: TicketPayload = {
      nonce: crypto.randomUUID(),
      actor,
      expiresAt: expiresAt.toISOString(),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", this.config.auth.websocketTicketSecret)
      .update(encoded)
      .digest("base64url");
    const ticket = `${encoded}.${signature}`;
    await this.collection.insertOne({
      hash: hashTicket(ticket),
      actor,
      tenantId: actor.tenantId,
      expiresAt,
      createdAt: new Date(),
      usedAt: null,
    });
    return { ticket, expiresAt: expiresAt.toISOString() };
  }

  async consume(ticket: string): Promise<SessionActor> {
    const [encoded, suppliedSignature, extra] = ticket.split(".");
    if (!encoded || !suppliedSignature || extra) {
      throw new HttpError(401, "UNAUTHENTICATED", "Ticket WebSocket inválido.");
    }
    const expectedSignature = createHmac("sha256", this.config.auth.websocketTicketSecret)
      .update(encoded)
      .digest("base64url");
    const supplied = Buffer.from(suppliedSignature);
    const expected = Buffer.from(expectedSignature);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
      throw new HttpError(401, "UNAUTHENTICATED", "Ticket WebSocket inválido.");
    }

    const document = await this.collection.findOneAndUpdate(
      {
        hash: hashTicket(ticket),
        usedAt: null,
        expiresAt: { $gt: new Date() },
      },
      { $set: { usedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!document) {
      throw new HttpError(401, "UNAUTHENTICATED", "Ticket WebSocket vencido o consumido.");
    }
    return document.actor;
  }
}
