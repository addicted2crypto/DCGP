export class KahanAccumulator {
  private _sum = 0;
  private _compensation = 0;

  add(value: number): void {
    const y = value - this._compensation;
    const t = this._sum + y;
    this._compensation = (t - this._sum) - y;
    this._sum = t;
  }

  get sum(): number {
    return this._sum;
  }

  reset(): void {
    this._sum = 0;
    this._compensation = 0;
  }
}

export function kahanSum(values: readonly number[]): number {
  const acc = new KahanAccumulator();
  for (const v of values) {
    acc.add(v);
  }
  return acc.sum;
}
