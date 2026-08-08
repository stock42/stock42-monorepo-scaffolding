import { PaginationInputSchema, UuidSchema } from "@stock42/contracts/common";
import { EmailSpoolerStatusSchema } from "@stock42/contracts/email-marketing";
import { z } from "zod";
import { getAppContext } from "@/context";
import { controller } from "@/http/controller";
import { authenticatedRequest } from "@/security/request";
import { requireMarketingTenant } from "../services/marketing-access";

const QuerySchema = PaginationInputSchema.extend({
  tenantId: UuidSchema,
  campaignId: UuidSchema.optional(),
  status: z.preprocess(
    (value) => (value === "" ? undefined : value),
    EmailSpoolerStatusSchema.optional(),
  ),
});

export default controller({
  name: "email-marketing.spooler.list",
  version: "1.0.0",
  method: "GET",
  path: "/email-spooler",
  async handler(request, response) {
    const context = getAppContext();
    const { actor } = await authenticatedRequest(request);
    const query = QuerySchema.parse(request.query);
    await requireMarketingTenant(actor, query.tenantId);
    const documents = await context.storages.emailSpooler.list(
      query.tenantId,
      query.limit,
      query.cursor,
      { campaignId: query.campaignId, status: query.status },
    );
    return response.json({
      ok: true,
      data: {
        items: documents.map((document) => context.emailMarketing.toPublicSpooler(document)),
        pagination: {
          limit: query.limit,
          nextCursor: documents.length === query.limit ? (documents.at(-1)?.uuid ?? null) : null,
        },
      },
    });
  },
});
