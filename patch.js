import { readFileSync, writeFileSync } from 'node:fs';

const path = 'src/index.ts';
let text = readFileSync(path, 'utf8');
const startMarker = '  server.tool(\n  "pipedrive_update_deal",';
const endMarker = '  server.tool(\n  "pipedrive_delete_deal",';

const replacement = `  server.tool(
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
    return ok(await pd("PUT", \`/deals/\${id}\`, body));
  }
  );
  
`;

if (text.includes('custom_fields: z.record')) {
  console.log('Deal custom_fields patch already present.');
  process.exit(0);
}

const start = text.indexOf(startMarker);
const end = text.indexOf(endMarker, start);

if (start === -1 || end === -1) {
  throw new Error('Could not locate pipedrive_update_deal block.');
}

text = text.slice(0, start) + replacement + text.slice(end);
writeFileSync(path, text);
console.log('Patched pipedrive_update_deal with custom_fields support.');
