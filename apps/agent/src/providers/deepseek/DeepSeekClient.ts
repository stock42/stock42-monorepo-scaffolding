import { z } from "zod";
import type { AgentConfig } from "@/config";
import type { ToolDefinition } from "@/runtime/contracts/types";

const ToolCallSchema = z.object({
  id: z.string().min(1),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    arguments: z.string(),
  }),
});

const CompletionResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          role: z.literal("assistant"),
          content: z.string().nullable(),
          reasoning_content: z.string().nullable().optional(),
          tool_calls: z.array(ToolCallSchema).optional(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
  usage: z
    .object({
      prompt_tokens: z.number().int().nonnegative(),
      completion_tokens: z.number().int().nonnegative(),
      total_tokens: z.number().int().nonnegative(),
    })
    .optional(),
});

export type DeepSeekMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  reasoning_content?: string | null;
  tool_calls?: Array<z.infer<typeof ToolCallSchema>>;
  tool_call_id?: string;
  name?: string;
};

export class DeepSeekClient {
  constructor(private readonly config: AgentConfig["deepseek"]) {}

  async complete(messages: DeepSeekMessage[], tools: ToolDefinition[]) {
    const response = await fetch(new URL("/chat/completions", this.config.baseUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.config.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-v4-pro",
        messages,
        tools: tools.map((tool) => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: z.toJSONSchema(tool.inputSchema),
          },
        })),
        tool_choice: "auto",
        thinking: { type: "enabled" },
        reasoning_effort: this.config.reasoningEffort,
        stream: false,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok) {
      throw new Error(`DeepSeek request failed with status ${response.status}`);
    }
    const parsed = CompletionResponseSchema.parse(await response.json());
    return parsed.choices[0]!.message;
  }
}
