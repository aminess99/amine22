/**
 * Waits for a background job on the server (see /api/jobs). Polling survives a
 * dropped connection: short network failures are retried, so the phone can
 * lose signal or lock its screen for a moment without losing the result.
 */
export async function waitForJob<T>(id: string, onTick?: (seconds: number) => void): Promise<T> {
  const started = Date.now();
  let failures = 0;
  for (;;) {
    await new Promise((r) => setTimeout(r, failures ? Math.min(8000, 1000 * 2 ** failures) : 2000));
    onTick?.(Math.round((Date.now() - started) / 1000));
    let res: Response;
    try {
      res = await fetch(`/api/jobs/${encodeURIComponent(id)}`, { cache: 'no-store' });
    } catch {
      // Offline for a moment: keep trying for about a minute.
      if (++failures > 8) throw new Error('انقطع الاتصال بالخادم. تحقق من الإنترنت ثم اضغط «حاول مرة أخرى».');
      continue;
    }
    failures = 0;
    if (res.status === 202) {
      if (Date.now() - started > 15 * 60_000) throw new Error('استغرق الذكاء الاصطناعي وقتاً طويلاً. حاول مرة أخرى.');
      continue;
    }
    // The server restarted (e.g. a new deploy) and forgot the job.
    if (res.status === 404) throw new Error('أُعيد تشغيل الخادم أثناء العمل. اضغط «حاول مرة أخرى».');
    if (!res.ok) throw new Error('لم ينجح الذكاء الاصطناعي هذه المرة. حاول مرة أخرى.');
    return (await res.json()).result as T;
  }
}

/** Whether the server answers at all (used to explain a failed request). */
export async function serverAlive(): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    return (await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })).ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The message for a request that failed without an answer. */
export async function connectionError(): Promise<Error> {
  return new Error(
    (await serverAlive())
      ? 'انقطع الاتصال أثناء الإرسال. تحقق من الإنترنت ثم اضغط «حاول مرة أخرى».'
      : 'الخادم لا يستجيب الآن (ربما يُعاد تشغيله). انتظر دقيقة ثم اضغط «حاول مرة أخرى».'
  );
}
