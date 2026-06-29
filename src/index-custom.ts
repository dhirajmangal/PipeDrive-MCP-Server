import { z } from "zod";
import axios, { AxiosInstance } from "axios";
import { createServer as createBaseServer } from "./index.js";

const API_TOKEN = process.env.PIPEDRIVE_API_TOKEN ?? "";
const BASE_URL = process.env.PIPEDRIVE_BASE_URL ?? "https://api.pipedrive.com/v1";

const UNIT_TYPE_FIELD_KEY = "5e5e5ca11fecee901991dceb79f39b9235ad5beb";
const BUYING_PURPOSE_FIELD_KEY = "16729fa3760725ab4339d928c582e7af99271c00";

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

export function createServer() {
  const server = createBaseServer();

  server.tool(
    "pipedrive_debug_deal_custom_fields",
    "Debug the Unit Type and Buying Purpose deal custom fields, returning field keys, types, and options if present.",
    {},
    async () => {
      const fieldsResponse = await pd("GET", "/dealFields", undefined, { limit: 500 });

      if (!fieldsResponse.success) {
        return ok(fieldsResponse);
      }

      const fields = fieldsResponse.data || [];
      const wantedFields = ["Unit Type", "Buying Purpose"];

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
    "Update actual Pipedrive deal custom fields for Unit Type and Buying Purpose, with dry-run and verification.",
    {
      deal_id: z.coerce.number().describe("Deal ID"),
      unit_type: z.string().optional().describe("Unit Type, e.g. 2 Bedroom"),
      buying_purpose: z.string().optional().describe("Buying Purpose, e.g. Own Residence or Investment"),
      dry_run: z.boolean().optional().default(false).describe("If true, return payload without writing"),
      overwrite: z.boolean().optional().default(false).describe("If false, do not overwrite existing custom field values"),
    },
    async ({ deal_id, unit_type, buying_purpose, dry_run = false, overwrite = false }) => {
      const existingDealResponse = await pd("GET", `/deals/${deal_id}`);

      if (!existingDealResponse.success) {
        return ok(existingDealResponse);
      }

      const existingDeal = existingDealResponse.data || {};
      const payload: Record<string, string> = {};
      const report: any[] = [];

      if (unit_type) {
        const existingValue = existingDeal[UNIT_TYPE_FIELD_KEY];

        if (!existingValue || overwrite) {
          const normalizedValue = normalizeUnitType(unit_type);
          payload[UNIT_TYPE_FIELD_KEY] = normalizedValue;

          report.push({
            field_name: "Unit Type",
            field_key: UNIT_TYPE_FIELD_KEY,
            field_type: "varchar",
            input_value: unit_type,
            value_sent_to_pipedrive: normalizedValue,
            previous_value: existingValue || null,
            action: "will_update",
          });
        } else {
          report.push({
            field_name: "Unit Type",
            field_key: UNIT_TYPE_FIELD_KEY,
            field_type: "varchar",
            input_value: unit_type,
            previous_value: existingValue,
            action: "skipped_existing_value",
            reason: "overwrite=false",
          });
        }
      }

      if (buying_purpose) {
        const existingValue = existingDeal[BUYING_PURPOSE_FIELD_KEY];

        if (!existingValue || overwrite) {
          const normalizedValue = normalizeBuyingPurpose(buying_purpose);
          payload[BUYING_PURPOSE_FIELD_KEY] = normalizedValue;

          report.push({
            field_name: "Buying Purpose",
            field_key: BUYING_PURPOSE_FIELD_KEY,
            field_type: "varchar",
            input_value: buying_purpose,
            value_sent_to_pipedrive: normalizedValue,
            previous_value: existingValue || null,
            action: "will_update",
          });
        } else {
          report.push({
            field_name: "Buying Purpose",
            field_key: BUYING_PURPOSE_FIELD_KEY,
            field_type: "varchar",
            input_value: buying_purpose,
            previous_value: existingValue,
            action: "skipped_existing_value",
            reason: "overwrite=false",
          });
        }
      }

      if (Object.keys(payload).length === 0) {
        return ok({
          success: false,
          deal_id,
          reason: "No fields to update. Either no values were provided, or existing values were protected by overwrite=false.",
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
        const verifiedValue = verifiedDeal[item.field_key];

        return {
          ...item,
          verified_stored_value: verifiedValue || null,
          verified: Boolean(verifiedValue),
        };
      });

      const allUpdated = verification
        .filter((item) => item.action === "will_update")
        .every((item) => item.verified === true);

      if (!allUpdated) {
        return ok({
          success: false,
          deal_id,
          error: "The update was attempted, but the actual Pipedrive custom-field column is still blank after verification.",
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
