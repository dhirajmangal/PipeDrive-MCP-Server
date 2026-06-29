import { z } from "zod";
import axios, { AxiosInstance } from "axios";
import { createServer as createBaseServer } from "./index.js";

const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN ?? "";
const BASE_URL = process.env.PIPEDRIVE_BASE_URL ?? "https://api.pipedrive.com/v1";

const UNIT_TYPE_FIELD_KEY = "5e5e5ca11fecee901991dceb79f39b9235ad5beb";
const BUYING_PURPOSE_FIELD_KEY = "16729fa3760725ab4339d928c582e7af99271c00";
const REAL_ESTATE_AGENCY_FIELD_KEY = "839214b23cbb0b624fd696a232c7de757f85f9d8";

function createClient(): AxiosInstance {
  if (!API_TOKEN) {
    throw new Error("PIPEDRIVE_API_TOKEN environment variable is required");
  }

  return axios.create({
    baseURL: BASE_URL,
    params: { api_token: API_TOKEN },
    headers: { "Content-Type": "application/json" },
  });
}

let _client: AxiosInstance | undefined;
function client(): AxiosInstance {
  if (!_client) _client = createClient();
  return _client;
}

async function pd(method: string, path: string, data?: any, params?: Record<string, any>) {
  try {
    const resp = await client().request({ method, url: path, data, params });
    return resp.data;
  } catch (err: any) {
    const msg = err.response?.data ?? err.message;
    return { success: false, error: typeof msg === "string" ? msg : JSON.stringify(msg) };
  }
}

function ok(result: any): { content: { type: "text"; text: string }[] } {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

function normalizeCustomFieldText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeUnitType(value: string): string {
  const cleaned = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    "studio": "Studio",
    "1 bed": "1 Bedroom",
    "1 beds": "1 Bedroom",
    "1 bedroom": "1 Bedroom",
    "1 bedrooms": "1 Bedroom",
    "1br": "1 Bedroom",
    "one bedroom": "1 Bedroom",
    "2 bed": "2 Bedroom",
    "2 beds": "2 Bedroom",
    "2 bedroom": "2 Bedroom",
    "2 bedrooms": "2 Bedroom",
    "2br": "2 Bedroom",
    "two bedroom": "2 Bedroom",
    "3 bed": "3 Bedroom",
    "3 beds": "3 Bedroom",
    "3 bedroom": "3 Bedroom",
    "3 bedrooms": "3 Bedroom",
    "3br": "3 Bedroom",
    "three bedroom": "3 Bedroom",
    "penthouse": "Penthouse",
  };

  return aliases[cleaned] || normalizeCustomFieldText(value);
}

function normalizeBuyingPurpose(value: string): string {
  const cleaned = value.trim().toLowerCase();

  const aliases: Record<string, string> = {
    "own residence": "Own Residence",
    "own use": "Own Residence",
    "primary residence": "Own Residence",
    "personal use": "Own Residence",
    "home": "Own Residence",
    "live in": "Own Residence",
    "investment": "Investment",
    "investor": "Investment",
    "rental": "Investment",
    "rental investment": "Investment",
    "buy to let": "Investment",
    "resale": "Investment",
  };

  return aliases[cleaned] || normalizeCustomFieldText(value);
}

function hasValue(value: any): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function valuesMatch(actual: any, expected: any): boolean {
  if (actual === expected) return true;
  if (actual === null || actual === undefined) return false;
  return String(actual) === String(expected);
}

export function createServer() {
  const server = createBaseServer();

  server.tool(
    "pipedrive_debug_deal_custom_fields",
    "Debug the deal custom fields used by the marketing workflow, returning field keys, types, and options if present.",
    {},
    async () => {
      const fieldsResponse = await pd("GET", "/dealFields", undefined, { limit: 500 });

      if (!fieldsResponse.success) {
        return ok(fieldsResponse);
      }

      const fields = fieldsResponse.data || [];
      const wantedFields = ["Real Estate Agency", "Buying Purpose", "Unit Type"];

      const result = wantedFields.map((fieldName) => {
        const field = fields.find(
          (f: any) =>
            String(f.name || "").trim().toLowerCase() === fieldName.toLowerCase()
        );

        if (!field) {
          return {
            field_name: fieldName,
            found: false,
          };
        }

        return {
          field_name: field.name,
          found: true,
          field_id: field.id,
          field_key: field.key,
          field_type: field.field_type,
          options: field.options || [],
        };
      });

      return ok({
        success: true,
        fields: result,
      });
    }
  );

  server.tool(
    "pipedrive_update_deal_custom_fields",
    "Update actual Pipedrive deal custom fields. Supports Unit Type, Buying Purpose, Real Estate Agency, and arbitrary custom field keys, with dry-run and verification.",
    {
      deal_id: z.coerce.number().describe("Deal ID"),
      unit_type: z.string().optional().describe("Unit Type, e.g. 2 Bedroom"),
      buying_purpose: z.string().optional().describe("Buying Purpose, e.g. Own Residence or Investment"),
      real_estate_agency_id: z.coerce.number().optional().describe("Person ID for the Real Estate Agency people custom field"),
      custom_fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional().describe("Raw Pipedrive custom-field key/value map. Use the exact 40-character field key from dealFields."),
      dry_run: z.boolean().optional().default(false).describe("If true, return payload without writing"),
      overwrite: z.boolean().optional().default(false).describe("If false, do not overwrite existing custom field values"),
    },
    async ({ deal_id, unit_type, buying_purpose, real_estate_agency_id, custom_fields, dry_run = false, overwrite = false }) => {
      const existingDealResponse = await pd("GET", `/deals/${deal_id}`);

      if (!existingDealResponse.success) {
        return ok(existingDealResponse);
      }

      const existingDeal = existingDealResponse.data || {};
      const payload: Record<string, any> = {};
      const report: any[] = [];

      function addField(fieldName: string, fieldKey: string, fieldType: string, inputValue: any, valueToSend: any) {
        const existingValue = existingDeal[fieldKey];

        if (!hasValue(existingValue) || overwrite) {
          payload[fieldKey] = valueToSend;
          report.push({
            field_name: fieldName,
            field_key: fieldKey,
            field_type: fieldType,
            input_value: inputValue,
            value_sent_to_pipedrive: valueToSend,
            previous_value: hasValue(existingValue) ? existingValue : null,
            action: "will_update",
          });
        } else {
          report.push({
            field_name: fieldName,
            field_key: fieldKey,
            field_type: fieldType,
            input_value: inputValue,
            previous_value: existingValue,
            action: "skipped_existing_value",
            reason: "overwrite=false",
          });
        }
      }

      if (unit_type) {
        addField("Unit Type", UNIT_TYPE_FIELD_KEY, "varchar", unit_type, normalizeUnitType(unit_type));
      }

      if (buying_purpose) {
        addField("Buying Purpose", BUYING_PURPOSE_FIELD_KEY, "varchar", buying_purpose, normalizeBuyingPurpose(buying_purpose));
      }

      if (real_estate_agency_id !== undefined) {
        addField("Real Estate Agency", REAL_ESTATE_AGENCY_FIELD_KEY, "people", real_estate_agency_id, real_estate_agency_id);
      }

      if (custom_fields) {
        for (const [fieldKey, value] of Object.entries(custom_fields)) {
          if (!/^[a-f0-9]{40}$/i.test(fieldKey)) {
            report.push({
              field_name: "Raw custom field",
              field_key: fieldKey,
              input_value: value,
              action: "skipped_invalid_field_key",
              reason: "Custom field keys should be the exact 40-character Pipedrive field key.",
            });
            continue;
          }

          addField("Raw custom field", fieldKey, "unknown", value, value);
        }
      }

      if (Object.keys(payload).length === 0) {
        return ok({
          success: false,
          deal_id,
          reason: "No fields to update. Either no values were provided, existing values were protected by overwrite=false, or raw custom-field keys were invalid.",
          report,
        });
      }

      if (dry_run) {
        return ok({
          success: true,
          dry_run: true,
          deal_id,
          payload,
          report,
        });
      }

      const updateResponse = await pd("PUT", `/deals/${deal_id}`, payload);

      if (!updateResponse.success) {
        return ok(updateResponse);
      }

      const verifyResponse = await pd("GET", `/deals/${deal_id}`);

      if (!verifyResponse.success) {
        return ok(verifyResponse);
      }

      const verifiedDeal = verifyResponse.data || {};

      const verification = report.map((item) => {
        if (item.action !== "will_update") {
          return item;
        }

        const verifiedValue = verifiedDeal[item.field_key];

        return {
          ...item,
          verified_stored_value: hasValue(verifiedValue) ? verifiedValue : null,
          verified: valuesMatch(verifiedValue, item.value_sent_to_pipedrive) || hasValue(verifiedValue),
        };
      });

      const allUpdated = verification
        .filter((item) => item.action === "will_update")
        .every((item) => item.verified === true);

      if (!allUpdated) {
        return ok({
          success: false,
          deal_id,
          error: "The update was attempted, but at least one Pipedrive custom-field column is still blank or unverifiable after verification.",
          payload,
          verification,
        });
      }

      return ok({
        success: true,
        deal_id,
        payload,
        verification,
      });
    }
  );

  return server;
}
