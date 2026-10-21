/// <reference lib="webworker" />

import { buildShell } from './geometry';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<{ type: string }>) => {
  if (event.data?.type !== 'build') return;

  try {
    const shell = buildShell();
    const transfer = shell.groups.map((group) => group.centers.buffer as ArrayBuffer);
    scope.postMessage({ type: 'shell', ...shell }, transfer);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Не удалось построить оболочку сферы.',
    });
  }
});
