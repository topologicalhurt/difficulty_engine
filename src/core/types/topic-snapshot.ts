export interface TopicNode {
  id: string;
  label: string;
  sourcePhrases: string[];
  rarityCoverage: {
    rarity: number;
    breadth: number;
    chapterSpread: number;
  };
  chapterAnchors: Array<{ bookId: string; idx: number }>;
  learnedComplexity: number;
}

export interface OverlapClusterSummary {
  id: string;
  topicIds: string[];
  bookIds: string[];
  primaryBookId: string;
  pruning: Array<{
    bookId: string;
    topicIds: string[];
    reason: string;
    timeSaved: number;
    overlapFrac: number;
    prereqPenalty: number;
    confidence: number;
  }>;
}
