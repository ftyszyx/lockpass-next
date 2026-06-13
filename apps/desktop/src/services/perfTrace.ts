const PERF_TRACE_KEY = 'lockpass-next:perf-trace'

export interface PerfTrace {
  mark(label: string): void
  measure<T>(label: string, task: () => Promise<T>): Promise<T>
  done(extra?: Record<string, unknown>): void
}

export function createPerfTrace(name: string): PerfTrace {
  const enabled = isPerfTraceEnabled()
  const start = now()
  let previous = start
  const marks: Array<{ label: string; deltaMs: number; totalMs: number }> = []

  function push(label: string): void {
    if (!enabled) return
    const current = now()
    marks.push({
      label,
      deltaMs: roundMs(current - previous),
      totalMs: roundMs(current - start)
    })
    previous = current
  }

  return {
    mark(label: string) {
      push(label)
    },
    async measure<T>(label: string, task: () => Promise<T>): Promise<T> {
      if (!enabled) return task()
      const stepStart = now()
      try {
        return await task()
      } finally {
        const current = now()
        marks.push({
          label,
          deltaMs: roundMs(current - stepStart),
          totalMs: roundMs(current - start)
        })
        previous = current
      }
    },
    done(extra: Record<string, unknown> = {}) {
      if (!enabled) return
      const totalMs = roundMs(now() - start)
      const payload = { name, totalMs, marks, ...extra }
      console.groupCollapsed(`[perf] ${name}: ${totalMs}ms`)
      console.table(marks)
      console.log(payload)
      console.info('[perf-json]', JSON.stringify(payload))
      console.groupEnd()
    }
  }
}

export function isPerfTraceEnabled(): boolean {
  return import.meta.env.DEV || window.localStorage.getItem(PERF_TRACE_KEY) === '1'
}

function now(): number {
  return performance.now()
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10
}
