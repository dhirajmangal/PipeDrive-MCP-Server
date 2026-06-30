# Patch: add custom_fields support to pipedrive_update_deal

## Problem

The MCP tool `pipedrive_update_deal` currently exposes only standard deal fields. This prevents ChatGPT/the marketing agent from writing values into actual Pipedrive custom-field columns such as Unit Type and Buying Purpose.

The current implementation in `src/index.ts` around `pipedrive_update_deal` sends only the normal update body:

```ts
server.tool(
  "pipedrive_update_deal",
  "Update an existing deal",
  {
    id: z.coerce.number().describe("Deal ID"),
    title: z.string().optional().describe("Deal title"),
    value: z.coerce.number().optional().describe("Deal monetary value"),
    currency: z.string().optional().describe("Currency code"),
    user_id: z.coerce.number().optional().describe("Owner user ID"),
    person_id: z.coerce.number().optional().describe("Associated person ID"),
    org_id: z.coerce.number().optional().describe("Associated organization ID"),
    pipeline_id: z.coerce.number().optional().describe("Pipeline ID"),
    stage_id: z.coerce.number().optional().describe("Stage ID"),
    status: z.enum(["open", "won", "lost"]).optional().describe("Deal status"),
    expected_close_date: z.string().optional().describe("Expected close date (YYYY-MM-DD)"),
    probability: z.coerce.number().optional().describe("Deal success probability (%)"),
    lost_reason: z.string().optional().describe("Reason deal was lost"),
    visible_to: z.coerce.number().optional().describe("Visibility setting"),
  },
  async ({ id, ...body }) => ok(await pd("PUT", `/deals/${id}`, body))
);
```

## Required replacement

Replace the existing `pipedrive_update_deal` tool block with this version:

```ts
server.tool(
  "pipedrive_update_deal",
  "Update an existing deal, including arbitrary custom-field keys",
  {
    id: z.coerce.number().describe("Deal ID"),
    title: z.string().optional().describe("Deal title"),
    value: z.coerce.number().optional().describe("Deal monetary value"),
    currency: z.string().optional().describe("Currency code"),
    user_id: z.coerce.number().optional().describe("Owner user ID"),
    person_id: z.coerce.number().optional().describe("Associated person ID"),
    org_id: z.coerce.number().optional().describe("Associated organization ID"),
    pipeline_id: z.coerce.number().optional().describe("Pipeline ID"),
    stage_id: z.coerce.number().optional().describe("Stage ID"),
    status: z.enum(["open", "won", "lost"]).optional().describe("Deal status"),
    expected_close_date: z.string().optional().describe("Expected close date (YYYY-MM-DD)"),
    probability: z.coerce.number().optional().describe("Deal success probability (%)"),
    lost_reason: z.string().optional().describe("Reason deal was lost"),
    visible_to: z.coerce.number().optional().describe("Visibility setting"),
    custom_fields: z.record(z.string(), z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.array(z.union([z.string(), z.number(), z.boolean()])),
      z.null(),
    ])).optional().describe("Custom-field values keyed by Pipedrive custom-field API key/hash"),
  },
  async ({ id, custom_fields, ...params }) => {
    const body: any = { ...params, ...(custom_fields ?? {}) };
    return ok(await pd("PUT", `/deals/${id}`, body));
  }
);
```

## Desired MCP input after deployment

```json
{
  "id": 12345,
  "custom_fields": {
    "unit_type_custom_field_key": "Office",
    "buying_purpose_custom_field_key": "Own Residence"
  }
}
```

## Deployment checklist

1. Apply the replacement in `src/index.ts`.
2. Run `npm run build`.
3. Commit and push the change.
4. Redeploy/restart the Railway MCP server.
5. Reconnect or refresh the MCP connection in ChatGPT if the tool schema is cached.
6. Confirm `pipedrive_update_deal` now exposes `custom_fields`.

## Acceptance criteria

- `pipedrive_update_deal` schema exposes `custom_fields`.
- The `custom_fields` object is flattened into the top-level Pipedrive deal update body.
- Existing normal deal updates continue working.
- Pipedrive custom-field API keys/hash values can be written directly.
