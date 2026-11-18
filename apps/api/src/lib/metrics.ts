/**
 * Minimal Prometheus exposition (text format 0.0.4) without a third-party client:
 * labelled counters and fixed-bucket histograms are all the service needs.
 */
type Labels = Record<string, string | number>;

const key = (labels: Labels) =>
  Object.keys(labels)
    .sort()
    .map((k) => `${k}="${String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`)
    .join(',');

interface Metric {
  render(): string;
}

export class Counter implements Metric {
  private readonly values = new Map<string, number>();
  constructor(
    readonly name: string,
    readonly help: string,
  ) {}

  inc(labels: Labels = {}, by = 1): void {
    const k = key(labels);
    this.values.set(k, (this.values.get(k) ?? 0) + by);
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    for (const [k, v] of this.values) lines.push(`${this.name}${k ? `{${k}}` : ''} ${v}`);
    return lines.join('\n');
  }
}

export class Gauge implements Metric {
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly read: () => number,
  ) {}

  render(): string {
    return `# HELP ${this.name} ${this.help}\n# TYPE ${this.name} gauge\n${this.name} ${this.read()}`;
  }
}

export class Histogram implements Metric {
  private readonly series = new Map<string, { counts: number[]; sum: number; count: number }>();
  constructor(
    readonly name: string,
    readonly help: string,
    private readonly buckets: number[],
  ) {}

  observe(labels: Labels, value: number): void {
    const k = key(labels);
    let s = this.series.get(k);
    if (!s) {
      s = { counts: this.buckets.map(() => 0), sum: 0, count: 0 };
      this.series.set(k, s);
    }
    this.buckets.forEach((b, i) => {
      if (value <= b) s.counts[i]! += 1;
    });
    s.sum += value;
    s.count += 1;
  }

  render(): string {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    for (const [k, s] of this.series) {
      const sep = k ? ',' : '';
      this.buckets.forEach((b, i) =>
        lines.push(`${this.name}_bucket{${k}${sep}le="${b}"} ${s.counts[i]}`),
      );
      lines.push(`${this.name}_bucket{${k}${sep}le="+Inf"} ${s.count}`);
      lines.push(`${this.name}_sum${k ? `{${k}}` : ''} ${s.sum}`);
      lines.push(`${this.name}_count${k ? `{${k}}` : ''} ${s.count}`);
    }
    return lines.join('\n');
  }
}

export class MetricsRegistry {
  private readonly metrics: Metric[] = [];

  readonly httpRequests = this.add(
    new Counter('http_requests_total', 'HTTP requests by method, route and status'),
  );
  readonly httpDuration = this.add(
    new Histogram(
      'http_request_duration_seconds',
      'HTTP request latency',
      [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    ),
  );
  readonly socketEvents = this.add(
    new Counter('socket_events_total', 'Socket.IO events received by name'),
  );
  readonly aiRequests = this.add(
    new Counter('ai_requests_total', 'AI provider calls by operation and outcome'),
  );

  readonly jobs = this.add(new Counter('jobs_total', 'Background jobs by name and outcome'));
  readonly jobDuration = this.add(
    new Histogram('job_duration_seconds', 'Background job run time', [0.05, 0.25, 1, 5, 30]),
  );

  add<M extends Metric>(m: M): M {
    this.metrics.push(m);
    return m;
  }

  render(): string {
    const mem = process.memoryUsage();
    const process_ = [
      `# TYPE process_resident_memory_bytes gauge\nprocess_resident_memory_bytes ${mem.rss}`,
      `# TYPE nodejs_heap_used_bytes gauge\nnodejs_heap_used_bytes ${mem.heapUsed}`,
      `# TYPE process_uptime_seconds gauge\nprocess_uptime_seconds ${Math.round(process.uptime())}`,
    ];
    return [...this.metrics.map((m) => m.render()), ...process_].join('\n') + '\n';
  }
}
