const WAIT_BUCKETS_SECONDS = [0.25, 0.5, 1, 2, 5, 10, 30, 60] as const;

/** Low-cardinality Connect metrics. User, session, report, and lane identifiers are never labels. */
export class ConnectObservabilityService {
  private queueDepth = 0;
  private sessionsStarted = 0;
  private reportsCreated = 0;
  private readonly waitCounts = new Array<number>(WAIT_BUCKETS_SECONDS.length + 1).fill(0);
  private waitSum = 0;

  setQueueDepth(depth: number): void {
    if (Number.isFinite(depth) && depth >= 0) this.queueDepth = Math.floor(depth);
  }

  recordMatch(waitMs: readonly [number, number]): void {
    this.sessionsStarted += 1;
    for (const duration of waitMs) {
      const seconds = Math.max(0, duration) / 1000;
      this.waitSum += seconds;
      const bucket = WAIT_BUCKETS_SECONDS.findIndex((limit) => seconds <= limit);
      const index = bucket === -1 ? WAIT_BUCKETS_SECONDS.length : bucket;
      this.waitCounts[index] = (this.waitCounts[index] ?? 0) + 1;
    }
  }

  recordReport(): void {
    this.reportsCreated += 1;
  }

  renderPrometheus(): string {
    const lines = [
      '# HELP posha_connect_queue_depth Current number of members waiting for a text match.',
      '# TYPE posha_connect_queue_depth gauge',
      `posha_connect_queue_depth ${this.queueDepth}`,
      '# HELP posha_connect_sessions_started_total Text sessions successfully started.',
      '# TYPE posha_connect_sessions_started_total counter',
      `posha_connect_sessions_started_total ${this.sessionsStarted}`,
      '# HELP posha_connect_reports_total Newly created Connect reports.',
      '# TYPE posha_connect_reports_total counter',
      `posha_connect_reports_total ${this.reportsCreated}`,
      '# HELP posha_connect_match_wait_seconds Time each matched participant waited in queue.',
      '# TYPE posha_connect_match_wait_seconds histogram',
    ];
    let cumulative = 0;
    WAIT_BUCKETS_SECONDS.forEach((bound, index) => {
      cumulative += this.waitCounts[index] ?? 0;
      lines.push(`posha_connect_match_wait_seconds_bucket{le="${bound}"} ${cumulative}`);
    });
    cumulative += this.waitCounts[WAIT_BUCKETS_SECONDS.length] ?? 0;
    lines.push(
      `posha_connect_match_wait_seconds_bucket{le="+Inf"} ${cumulative}`,
      `posha_connect_match_wait_seconds_sum ${this.waitSum}`,
      `posha_connect_match_wait_seconds_count ${cumulative}`,
    );
    return lines.join('\n') + '\n';
  }
}
