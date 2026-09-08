import { fieldsFor } from './export';
import type { Market } from './types';

const integer = { type: 'integer', minimum: 0 };
const error = {
  type: 'object',
  additionalProperties: false,
  required: ['code', 'message', 'retryable'],
  properties: {
    code: { type: 'string' },
    message: { type: 'string' },
    retryable: { type: 'boolean' },
    httpStatus: integer,
    binanceCode: { type: 'integer' },
  },
};
export const reportSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['schemaVersion', 'status', 'results'],
  properties: {
    schemaVersion: { const: 1 },
    status: { enum: ['success', 'error'] },
    error,
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pair', 'market', 'status', 'outputPath', 'resumable'],
        properties: {
          pair: { type: 'string' },
          market: { enum: ['spot', 'usd-m', 'coin-m'] },
          status: { enum: ['success', 'error'] },
          outputPath: { type: 'string' },
          count: integer,
          requests: integer,
          retries: integer,
          resumed: { type: 'boolean' },
          referenceTime: integer,
          resumable: { type: 'boolean' },
          error,
        },
        oneOf: [
          {
            properties: { status: { const: 'success' } },
            required: [
              'count',
              'requests',
              'retries',
              'resumed',
              'referenceTime',
            ],
          },
          { properties: { status: { const: 'error' } }, required: ['error'] },
        ],
      },
    },
  },
};
export function candleSchema(market: Market) {
  const fields = fieldsFor(market);
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: fields,
      properties: Object.fromEntries(
        fields.map((field) => [
          field,
          ['openTime', 'closeTime', 'trades'].includes(field)
            ? integer
            : { type: 'string', pattern: '^\\d+(?:\\.\\d+)?$' },
        ]),
      ),
    },
  };
}
