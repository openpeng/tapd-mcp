/**
 * Host compatibility helpers for MCP tool argument handling.
 *
 * ## Why this exists
 *
 * Several MCP hosts (MiniMax Code among them) run a "smart" coercion pass on
 * tool arguments *before* they validate them against the tool's `inputSchema`:
 *
 *   1. TypeBox `Value.Convert(schema, args)`  — converts values to the schema type
 *   2. pi-ai  `coerceWithJsonSchema(args, schema)` — string→number / number→string coercion
 *   3. CfWorker JSON-Schema validation — strict, produces errors like
 *      `/refresh: must be boolean` or `/workspace_id: must be string`
 *
 * The net effect is that a *string* argument whose content happens to look like
 * a number (e.g. `workspace_id: "37748852"`, a TAPD workspace id) arrives at
 * the validator as a **number**, while the schema still declares
 * `type: 'string'`. Validation then fails with a confusing "must be string"
 * error even though the caller passed a perfectly reasonable string.
 *
 * The same pass mangles booleans that travel as `"true"` / `1`.
 *
 * ## The fix
 *
 * Declare every scalar property as a **union** of the types the host might
 * produce. Two things follow from that:
 *
 * - The schema accepts both the string form and the coerced form, so the
 *   host's validator never rejects a legitimate call.
 * - pi-ai's `coerceWithJsonSchema` *skips* coercion entirely once a value
 *   already matches one of the union members
 *   (`matchesUnionMember = schemaTypes.length > 1 && ...`), so a correctly
 *   typed value is passed through untouched.
 *
 * On the server side we still normalise every argument against the schema, so
 * handlers can rely on `args.limit` being a number and `args.workspace_id`
 * being a string.
 */

/** A JSON-Schema node we may need to walk. */
type SchemaNode = Record<string, any>;

/**
 * Type unions advertised for each scalar type.
 *
 * `string` additionally accepts `number` because TAPD ids are numeric strings
 * that hosts like to turn into numbers. `number` additionally accepts `string`
 * because a host may stringify every value. `boolean` accepts the string and
 * number spellings of truth values.
 */
const SCALAR_TYPE_UNIONS: Record<string, string[]> = {
  string: ['string', 'number'],
  number: ['number', 'string'],
  boolean: ['boolean', 'string', 'number'],
};

/**
 * Walk a JSON-Schema fragment and widen every scalar `type` to a union.
 *
 * Mutates and returns `node` so it can be used inline.
 */
export function relaxScalarTypes(node: SchemaNode): SchemaNode {
  if (!node || typeof node !== 'object') return node;

  // The property itself may declare a scalar type.
  if (typeof node.type === 'string' && SCALAR_TYPE_UNIONS[node.type]) {
    node.type = [...SCALAR_TYPE_UNIONS[node.type]];
  }

  // Recurse into `properties`.
  if (node.properties && typeof node.properties === 'object') {
    for (const prop of Object.values(node.properties)) {
      if (prop && typeof prop === 'object') relaxScalarTypes(prop as SchemaNode);
    }
  }

  // Recurse into `items` (single schema or tuple).
  if (Array.isArray(node.items)) {
    for (const item of node.items) {
      if (item && typeof item === 'object') relaxScalarTypes(item as SchemaNode);
    }
  } else if (node.items && typeof node.items === 'object') {
    relaxScalarTypes(node.items as SchemaNode);
  }

  // Recurse into `additionalProperties` when it is a schema.
  if (
    node.additionalProperties &&
    typeof node.additionalProperties === 'object' &&
    !Array.isArray(node.additionalProperties)
  ) {
    relaxScalarTypes(node.additionalProperties as SchemaNode);
  }

  return node;
}

/**
 * Collect the scalar types a schema node accepts.
 * Mirrors the host's `getSchemaTypes()` so our normalisation agrees with it.
 */
function schemaTypes(schema: SchemaNode): string[] {
  if (typeof schema.type === 'string') return [schema.type];
  if (Array.isArray(schema.type)) return schema.type.filter((t) => typeof t === 'string');
  return [];
}

/** True when the value already satisfies one of the schema's types. */
function matchesSchemaType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
    case 'integer':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'null':
      return value === null;
    default:
      return false;
  }
}

/**
 * Coerce a single value to a schema type, mirroring the host's
 * `coercePrimitiveByType()` but stricter about what it accepts:
 * a boolean only becomes `true`/`false` for unambiguous spellings.
 */
function coerceToType(value: unknown, type: string): unknown {
  switch (type) {
    case 'string':
      if (typeof value === 'number' || typeof value === 'boolean') return String(value);
      return value;
    case 'number':
    case 'integer': {
      if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
      }
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    }
    case 'boolean': {
      if (typeof value === 'string') {
        const lowered = value.trim().toLowerCase();
        if (lowered === 'true' || lowered === '1') return true;
        if (lowered === 'false' || lowered === '0') return false;
      }
      if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
      }
      return value;
    }
    default:
      return value;
  }
}

/**
 * Normalise a value against a (already relaxed) schema node.
 *
 * For a union the members are tried in declaration order, so the canonical
 * type is the first member of the union. That gives us:
 *   - `['string', 'number']`  -> ids stay strings (never lose precision)
 *   - `['number', 'string']`  -> `limit` / `page` become real numbers
 *   - `['boolean', ...]`      -> flags become real booleans
 */
function normalizeValue(value: unknown, schema: SchemaNode): unknown {
  if (!schema || typeof schema !== 'object') return value;

  const types = schemaTypes(schema);
  if (types.length === 0) return value;

  if (types.length === 1) {
    return coerceToType(value, types[0]);
  }

  // Union: pick the first member that can represent the value.
  for (const type of types) {
    const coerced = coerceToType(value, type);
    if (matchesSchemaType(coerced, type)) return coerced;
  }

  return value;
}

/**
 * Normalise the arguments of a tool call against the tool's input schema.
 *
 * Mutates and returns `args` so handlers can trust the declared types:
 * `workspace_id` is a string, `limit` is a number, `refresh` is a boolean.
 */
export function normalizeArgs<T extends Record<string, unknown>>(
  args: T,
  schema: SchemaNode
): T {
  if (!args || typeof args !== 'object') return args;
  if (!schema || typeof schema !== 'object') return args;

  const properties = schema.properties;
  if (!properties || typeof properties !== 'object') return args;

  for (const [key, propSchema] of Object.entries(properties)) {
    if (!(key in args)) continue;
    if (!propSchema || typeof propSchema !== 'object') continue;

    const prop = propSchema as SchemaNode;
    const value = args[key];
    const normalized = normalizeValue(value, prop);

    if (normalized !== value) {
      (args as Record<string, unknown>)[key] = normalized;
    }

    // `overrides`-style maps: normalise each nested value too.
    if (
      prop.additionalProperties &&
      typeof prop.additionalProperties === 'object' &&
      !Array.isArray(prop.additionalProperties) &&
      normalized &&
      typeof normalized === 'object' &&
      !Array.isArray(normalized)
    ) {
      for (const [nestedKey, nestedValue] of Object.entries(normalized as Record<string, unknown>)) {
        const nested = normalizeValue(nestedValue, prop.additionalProperties as SchemaNode);
        if (nested !== nestedValue) {
          (normalized as Record<string, unknown>)[nestedKey] = nested;
        }
      }
    }
  }

  return args;
}
