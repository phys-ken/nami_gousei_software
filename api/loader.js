'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function loadIntoSandbox(sandbox, filePath, exposeNames) {
  const src = fs.readFileSync(filePath, 'utf8');
  const probes = exposeNames
    .map((n) => `try { globalThis.${n} = eval('${n}'); } catch (e) {}`)
    .join('\n');
  const wrapped = `${src}\n;(function(){\n${probes}\n}).call(globalThis);`;
  vm.runInContext(wrapped, sandbox, { filename: filePath, displayErrors: true });
}

const JS_FILES = [
  { file: 'wave.js',     expose: ['Wave'] },
  { file: 'random.js',   expose: ['SeededRandom'] },
  { file: 'styles.js',   expose: ['STYLE_PRESETS', 'cloneStylePreset'] },
  { file: 'renderer.js', expose: ['WaveRenderer'] },
  { file: 'problems.js', expose: ['ProblemGenerator'] },
];

function loadAllJsModules(sandbox, jsDir) {
  for (const { file, expose } of JS_FILES) {
    loadIntoSandbox(sandbox, path.join(jsDir, file), expose);
  }
}

module.exports = { loadIntoSandbox, loadAllJsModules, JS_FILES };
