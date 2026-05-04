export interface RelationEvidence {
  from: string;
  to: string;
  type:
    | 'prerequisite'
    | 'co-study'
    | 'reference'
    | 'manual-block'
    | 'manual-allow-overlap';
  score: number;
  confidence: number;
  symmetry: number;
  reasons: string[];
  sources: string[];
  explanation: string;
}
