import { readFileSync, writeFileSync, existsSync } from "node:fs";

const distIndexPath = "dist/index.js";

if (!existsSync(distIndexPath)) {
  throw new Error(`${distIndexPath} does not exist. Run this script after TypeScript compilation.`);
}

let source = readFileSync(distIndexPath, "utf8");

if (source.includes("custom_fields: z.record")) {
  console.log("pipedrive_update_deal already supports custom_fields; no patch needed.");
  process.exit(0);
}

const schemaNeedle = `    visible_to: z.coerce.number().optional().describe("Visibility setting"),\n  },\n  async ({ id, ...body }) => ok(await pd("PUT", \`/deals/${id}\`, body))\n  );`;

const schemaReplacement = `    visible_to: z.coerce.number().optional().describe("Visibility setting"),
    custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe("Raw Pipedrive custom-field key/value map. Use the exact 40-character field key from dealFields."),
  },
  async ({ id, custom_fields, ...body }) => {
    const payload = { ...body };

    if (custom_fields) {
      for (const [fieldKey, value] of Object.entries(custom_fields)) {
        if (!/^[a-f0-9]{40}$/i.test(fieldKey)) {
          return ok({
            success: false,
            error: "Invalid custom field key",
            field_key: fieldKey,
            reason: "Use the exact 40-character Pipedrive custom field key from pipedrive_list_deal_fields.",
          });
        }

        payload[fieldKey] = value;
      }
    }

    return ok(await pd("PUT", \`/deals/${id}\`, payload));
  }
  );`;

if (!source.includes(schemaNeedle)) {
  throw new Error("Could not find the pipedrive_update_deal block to patch. The generated dist/index.js may have changed.");
}

source = source.replace(schemaNeedle, schemaReplacement);
writeFileSync(distIndexPath, source);

console.log("Patched pipedrive_update_deal to support custom_fields.");
