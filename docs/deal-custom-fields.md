# Deal custom field updates

The HTTP entrypoint uses `src/index-custom.ts`, which wraps the base Pipedrive MCP server and overrides the visible `pipedrive_update_deal` tool so it can write actual Pipedrive custom deal fields.

## Why this exists

The base MCP server exposes many tools. Extra custom tools added after the base server may not appear in clients that cap the number of exposed tools. By overriding the existing `pipedrive_update_deal` tool, clients can keep using the same visible action while also passing custom deal fields.

## Usage

Use `custom_fields` with exact Pipedrive deal field keys from `pipedrive_list_deal_fields`.

```json
{
  "id": 123,
  "custom_fields": {
    "16729fa3760725ab4339d928c582e7af99271c00": "Own Residence",
    "5e5e5ca11fecee901991dceb79f39b9235ad5beb": "3 Bedroom"
  }
}
```

## Current real estate field keys

| Field | Pipedrive key |
| --- | --- |
| Buying Purpose | `16729fa3760725ab4339d928c582e7af99271c00` |
| Unit Type | `5e5e5ca11fecee901991dceb79f39b9235ad5beb` |
| Real Estate Agency | `839214b23cbb0b624fd696a232c7de757f85f9d8` |

## Notes

- `custom_fields` is merged into the outgoing Pipedrive update payload.
- Field keys are validated as 40-character Pipedrive custom field keys.
- Standard deal fields such as `title`, `person_id`, `stage_id`, and `expected_close_date` still work normally.
- After deploying, refresh or reconnect the MCP client if the old schema is cached.
