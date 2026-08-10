/**
 * GPU Device Test — Vulkan / OpenCL / Metal
 *
 * Tries each GPU backend in sequence and reports which one actually works.
 *
 * Run with: npx tsx scripts/benchmark-models.ts
 */

import {
  startQVACProvider,
  stopQVACProvider,
  loadModel,
  unloadModel,
  completion,
  cancel as qvacCancel,
  getModelInfo,
  getLoadedModelInfo,
} from '@qvac/sdk';
import * as qvacModels from '@qvac/sdk';
import { QWEN_MODEL_ID, GTE_MODEL_ID } from '../src/constants.js';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';

const $ = {
  header: (s: string) =>
    console.log(
      `\n${BOLD}${CYAN}${'═'.repeat(60)}${RESET}\n${BOLD}${CYAN} ${s}${RESET}\n${BOLD}${CYAN}${'═'.repeat(60)}${RESET}`,
    ),
  section: (s: string) => console.log(`\n${BOLD}${YELLOW}▶ ${s}${RESET}`),
  ok: (s: string) => console.log(`  ${GREEN}✓${RESET} ${s}`),
  info: (s: string) => console.log(`  ${CYAN}ℹ${RESET} ${s}`),
  warn: (s: string) => console.log(`  ${YELLOW}⚠${RESET} ${s}`),
  err: (s: string) => console.log(`  ${RED}✗${RESET} ${s}`),
  raw: (s: string) => console.log(s),
};

const TIMEOUT_MS = 2 * 60 * 1000;

async function raceTimeout<T>(
  run: { requestId: string; final: Promise<T> },
  ms = TIMEOUT_MS,
  label = '',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, rej) => {
    timer = setTimeout(async () => {
      $.warn(`${label} hitting ${ms / 1000}s timeout — cancelling request ${run.requestId}`);
      try {
        await qvacCancel({ requestId: run.requestId });
      } catch {}
      rej(new Error(`timed out after ${ms / 1000}s`));
    }, ms);
  });
  try {
    const r = await Promise.race([run.final, deadline]);
    clearTimeout(timer!);
    return r;
  } catch (e) {
    clearTimeout(timer!);
    throw e;
  }
}

interface ProbeResult {
  device: string;
  loadedOk: boolean;
  inferenceOk: boolean;
  backendDevice?: string;
  tps?: number;
  promptTokens?: number;
  genTokens?: number;
  wallMs?: number;
  error?: string;
  response?: string;
}

async function tryDevice(device: string, gpuLayers = -1): Promise<ProbeResult> {
  $.section(`─── device="${device}"  gpu_layers=${gpuLayers} ───`);

  // Isolate each test by restarting the provider
  $.info('Starting provider for this test...');
  await startQVACProvider();
  await new Promise((r) => setTimeout(r, 1000));

  const obj = (qvacModels as any)[QWEN_MODEL_ID];
  if (!obj) throw new Error('QWEN model not found');

  $.info('Loading model...');
  let loadedId = '';
  const tLoad = performance.now();

  try {
    loadedId = await loadModel({
      modelSrc: obj,
      modelConfig: { ctx_size: 1024, device, gpu_layers: gpuLayers } as any,
    });
    $.ok(`Loaded in ${((performance.now() - tLoad) / 1000).toFixed(2)}s  id=${loadedId}`);
  } catch (e: any) {
    $.err(`loadModel failed: ${e.message}`);
    await stopQVACProvider();
    return { device, loadedOk: false, inferenceOk: false, error: e.message };
  }

  $.info(`Running inference (timeout ${TIMEOUT_MS / 1000}s)...`);
  const history = [
    { role: 'system', content: '/no_think\nYou are a helpful assistant.' },
    { role: 'user', content: 'Say only the single word "hello".' },
  ];

  const tInfer = performance.now();
  const run = completion({ modelId: loadedId, history, stream: false });
  $.info(`requestId: ${run.requestId}`);

  // Ticker
  const ticker = setInterval(() => process.stdout.write('.'), 5000);

  let final: any;
  try {
    final = await raceTimeout(run, TIMEOUT_MS, `device=${device} inference`);
    clearInterval(ticker);
    process.stdout.write('\n');
  } catch (e: any) {
    clearInterval(ticker);
    process.stdout.write('\n');
    $.err(`Inference failed: ${e.message}`);
    await stopQVACProvider();
    return { device, loadedOk: true, inferenceOk: false, error: e.message };
  }

  const wallMs = performance.now() - tInfer;
  const stats = (final as any).stats ?? {};
  const backendDevice = stats.backendDevice ?? 'unknown';
  const tps = stats.tokensPerSecond ?? 0;
  const pTok = stats.promptTokens ?? 0;
  const gTok = stats.generatedTokens ?? 0;
  const resp = (final.content ?? '').replace(/\n/g, ' ').slice(0, 100);

  const isGpu = /gpu|metal|cuda|vulkan|opencl/i.test(backendDevice);
  $.ok(`Response:      "${resp}"`);
  $.ok(`backendDevice: ${BOLD}${isGpu ? GREEN : RED}${backendDevice}${RESET}`);
  $.ok(`TPS:           ${BOLD}${GREEN}${tps.toFixed(1)}${RESET} tok/s`);
  $.ok(`Prompt tokens: ${pTok}`);
  $.ok(`Gen tokens:    ${gTok}`);
  $.ok(`Wall time:     ${(wallMs / 1000).toFixed(2)}s`);

  $.info('Stopping provider...');
  await stopQVACProvider();
  await new Promise((r) => setTimeout(r, 1000));

  return {
    device,
    loadedOk: true,
    inferenceOk: true,
    backendDevice,
    tps,
    promptTokens: pTok,
    genTokens: gTok,
    wallMs,
    response: resp,
  };
}

async function main() {
  $.header('GPU DEVICE BENCHMARK');
  $.info(`Platform:  ${process.platform} / ${process.arch}  Node ${process.version}`);
  $.info(`Model:     ${QWEN_MODEL_ID}`);
  $.info(`Timeout:   ${TIMEOUT_MS / 1000}s per call`);

  $.header('PROBING GPU BACKENDS');

  // Only 'gpu' and 'cpu' are valid device strings for the QVAC SDK.
  // vulkan/opencl/metal are not supported and fail immediately.
  const devicesToTry = ['gpu', 'cpu'];
  const results: ProbeResult[] = [];

  for (const device of devicesToTry) {
    try {
      const result = await tryDevice(device, device === 'cpu' ? 0 : -1);
      results.push(result);
      if (result.inferenceOk && device !== 'cpu') {
        $.ok(`\n  🎉 GPU inference works with device="${device}"! Stopping probes.`);
        break;
      }
    } catch (e: any) {
      $.err(`Probe for device="${device}" threw unexpectedly: ${e.message}`);
      results.push({ device, loadedOk: false, inferenceOk: false, error: e.message });
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────────
  $.header('RESULTS SUMMARY');
  $.raw(
    `\n  ${'Device'.padEnd(10)} ${'Loaded'.padEnd(8)} ${'Inference'.padEnd(12)} ${'Backend'.padEnd(14)} ${'TPS'.padEnd(10)} Result`,
  );
  $.raw(`  ${'─'.repeat(72)}`);

  for (const r of results) {
    const loadStr = r.loadedOk ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`;
    const inferStr = r.inferenceOk ? `${GREEN}yes${RESET}` : `${RED}no${RESET}`;
    const isGpu = /gpu|metal|cuda|vulkan|opencl/i.test(r.backendDevice ?? '');
    const devColor = isGpu ? GREEN : RED;
    const tpsStr = r.tps != null ? `${BOLD}${GREEN}${r.tps.toFixed(1)}${RESET}` : '—';
    const extra = r.inferenceOk
      ? `${(r.wallMs! / 1000).toFixed(2)}s  "${(r.response ?? '').slice(0, 30)}"`
      : `ERROR: ${(r.error ?? '').slice(0, 40)}`;

    $.raw(
      `  ${r.device.padEnd(10)} ${loadStr.padEnd(15)} ${inferStr.padEnd(19)}` +
        ` ${devColor}${(r.backendDevice ?? '—').padEnd(14)}${RESET}` +
        ` ${tpsStr.padEnd(17)} ${extra}`,
    );
  }

  const winner = results.find((r) => r.inferenceOk && r.device !== 'cpu');
  const cpuResult = results.find((r) => r.device === 'cpu' && r.inferenceOk);

  if (winner) {
    $.raw(
      `\n  ${GREEN}${BOLD}✓ GPU WORKS: device="${winner.device}"  backend="${winner.backendDevice}"  TPS=${winner.tps?.toFixed(1)}${RESET}`,
    );
  } else if (cpuResult) {
    $.raw(
      `\n  ${YELLOW}${BOLD}⚠ No GPU backend worked. CPU fallback: TPS=${cpuResult.tps?.toFixed(1)}${RESET}`,
    );
  } else {
    $.raw(`\n  ${RED}${BOLD}✗ Nothing worked.${RESET}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
