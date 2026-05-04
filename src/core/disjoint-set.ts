export class DisjointSet {
  private readonly parent: Record<string, string>;

  constructor(ids: string[]) {
    this.parent = {};
    ids.forEach((id) => {
      this.parent[id] = id;
    });
  }

  has(id: string): boolean {
    return Boolean(this.parent[id]);
  }

  find(id: string): string {
    if (this.parent[id] === id) return id;
    this.parent[id] = this.find(this.parent[id]);
    return this.parent[id];
  }

  union(left: string, right: string): void {
    if (!this.has(left) || !this.has(right)) return;
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }

  groups(ids: string[]): string[][] {
    const grouped: Record<string, string[]> = {};
    ids.forEach((id) => {
      if (!this.has(id)) return;
      const root = this.find(id);
      if (!grouped[root]) grouped[root] = [];
      grouped[root].push(id);
    });
    return Object.values(grouped).map((group) => group.sort());
  }
}
