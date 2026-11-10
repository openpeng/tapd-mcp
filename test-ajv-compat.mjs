/**
 * Ajv compatibility probe.
 *
 * The desktop host validates MCP tool arguments with Ajv v8 (the same version
 * and the same options the MCP SDK's `AjvJsonSchemaValidator` uses:
 * `strict:false, validateFormats:true, validateSchema:false, allErrors:true`).
 *
 * This probe checks that:
 *   - the OLD schema (single scalar types) rejects the argument shapes the
 *     host mangles, reproducing the production bug, and
 *   - the NEW schema (union types) accepts all of them.
 */
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const ajv = new Ajv({
  strict: false,
  validateFormats: true,
  validateSchema: false,
  allErrors: true,
});
addFormats(ajv);

const oldSchema = {
  type: 'object',
  properties: {
    workspace_id: { type: 'string' },
    limit: { type: 'number' },
    refresh: { type: 'boolean' },
  },
  required: ['workspace_id'],
};

const newSchema = {
  type: 'object',
  properties: {
    workspace_id: { type: ['string', 'number'] },
    limit: { type: ['number', 'string'] },
    refresh: { type: ['boolean', 'string', 'number'] },
  },
  required: ['workspace_id'],
};

function trySchema(label, schema, args) {
  const v = ajv.compile(schema);
  const data = structuredClone(args);
  const valid = v(data);
  const errs = (v.errors || []).map((e) => `${e.instancePath}: ${e.message}`).join('; ');
  console.log(`${label.padEnd(30)} valid=${String(valid).padEnd(6)} ${errs}`);
}

console.log('--- OLD schema (single scalar types) ---');
trySchema('workspace_id "37748852"', oldSchema, { workspace_id: '37748852' });
trySchema('workspace_id 37748852', oldSchema, { workspace_id: 37748852 });
trySchema('limit true', oldSchema, { workspace_id: '37748852', limit: true });
trySchema('refresh true', oldSchema, { workspace_id: '37748852', refresh: true });
trySchema('workspace_id missing', oldSchema, { limit: 1 });

console.log('\n--- NEW schema (union types) ---');
trySchema('workspace_id "37748852"', newSchema, { workspace_id: '37748852' });
trySchema('workspace_id 37748852', newSchema, { workspace_id: 37748852 });
trySchema('limit true', newSchema, { workspace_id: '37748852', limit: true });
trySchema('limit "3"', newSchema, { workspace_id: '37748852', limit: '3' });
trySchema('refresh true', newSchema, { workspace_id: '37748852', refresh: true });
trySchema('refresh "true"', newSchema, { workspace_id: '37748852', refresh: 'true' });
trySchema('refresh 1', newSchema, { workspace_id: '37748852', refresh: 1 });
trySchema('workspace_id missing', newSchema, { limit: 1 });
