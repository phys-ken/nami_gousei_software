'use strict';

const { z } = require('zod');

const Vertex = z.object({
  x: z.number().int(),
  y: z.number().refine((v) => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9, {
    message: 'y must be a multiple of 0.5',
  }),
});

const WaveSpec = z.object({
  vertices: z.array(Vertex),
  speed: z.number().nonnegative().default(1),
  direction: z.union([z.literal(1), z.literal(-1)]).default(1),
  label: z.string().optional(),
});

const GridSpec = z.object({
  xMin: z.number(),
  xMax: z.number(),
  yMin: z.number(),
  yMax: z.number(),
  paddingLeft: z.number().int().nonnegative().optional(),
  paddingRight: z.number().int().nonnegative().optional(),
  paddingTop: z.number().int().nonnegative().optional(),
  paddingBottom: z.number().int().nonnegative().optional(),
}).refine((g) => g.xMin < g.xMax && g.yMin < g.yMax, {
  message: 'xMin < xMax and yMin < yMax must hold',
});

const CellSize = z.object({
  w: z.number().int().min(15).max(120).nullable().optional(),
  h: z.number().int().min(15).max(120).nullable().optional(),
}).optional();

const StyleSpec = z.union([z.enum(['gray', 'bw']), z.record(z.any())]).optional();

const ChoicesSpec = z.object({
  enabled: z.boolean(),
  count: z.number().int().min(2).max(10),
  shuffle: z.boolean().default(true),
  source: z.enum(['manual', 'auto']).default('manual'),
  distractors: z.array(WaveSpec).default([]),
}).optional();

const ParamsSpec = z.object({
  answerT: z.number().optional(),
  x: z.number().optional(),
  t: z.number().optional(),
  tMax: z.number().int().positive().optional(),
  tStart: z.number().optional(),
  tEnd: z.number().optional(),
  boundary: z.number().int().optional(),
  endType: z.enum(['fixed', 'free']).optional(),
}).default({});

const TypeSchema = z.number().int().min(1).max(7);

const GenerateRequest = z.object({
  type: TypeSchema,
  grid: GridSpec.optional(),
  cellSize: CellSize,
  style: StyleSpec,
  waveA: WaveSpec,
  waveB: WaveSpec.nullable().optional(),
  params: ParamsSpec,
  choices: ChoicesSpec,
  outputDir: z.string().nullable().optional(),
  filenamePrefix: z.string().max(64).optional(),
  inline: z.boolean().default(false),
}).superRefine((v, ctx) => {
  const t = v.type;
  const p = v.params || {};
  const need = (key, types) => {
    if (types.includes(t) && p[key] === undefined) {
      ctx.addIssue({ code: 'custom', path: ['params', key], message: `params.${key} is required for type ${t}` });
    }
  };
  need('answerT', [1, 4, 6]);
  need('x', [2, 3]);
  need('t', [2]);
  need('tMax', [3]);
  need('tStart', [5, 7]);
  need('tEnd', [5, 7]);
  need('boundary', [6, 7]);
  need('endType', [6, 7]);

  if ([4, 5].includes(t) && !v.waveB) {
    ctx.addIssue({ code: 'custom', path: ['waveB'], message: `waveB is required for type ${t}` });
  }
  if (v.choices?.enabled) {
    if (![3, 4, 6].includes(t)) {
      ctx.addIssue({ code: 'custom', path: ['choices'], message: 'choices are only supported for types 3, 4, 6' });
    }
    if (v.choices.distractors.length !== v.choices.count - 1) {
      ctx.addIssue({
        code: 'custom', path: ['choices', 'distractors'],
        message: `distractors.length (${v.choices.distractors.length}) must equal count-1 (${v.choices.count - 1})`,
      });
    }
  }
});

function validateRequest(input) {
  return GenerateRequest.safeParse(input);
}

module.exports = { validateRequest, GenerateRequest, WaveSpec, GridSpec };
