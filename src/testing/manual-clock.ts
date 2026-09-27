import { CountdownClock } from '../app/countdown';

/** A clock whose callbacks can deliberately arrive late, unlike a normal fake timer. */
export class ManualClock implements CountdownClock {
  time = 0;
  private nextId = 0;
  private jobs = new Map<number, { at: number; run: () => void }>();
  now = () => this.time;
  schedule(run: () => void, delay: number): unknown {
    const id = ++this.nextId;
    this.jobs.set(id, { at: this.time + delay, run });
    return id;
  }
  cancel(handle: unknown): void {
    this.jobs.delete(handle as number);
  }
  get pending(): number {
    return this.jobs.size;
  }
  fireAt(time: number): void {
    this.time = time;
    for (const [id, job] of [...this.jobs]) {
      if (job.at <= time) {
        this.jobs.delete(id);
        job.run();
      }
    }
  }
}
