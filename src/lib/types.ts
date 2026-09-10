export type ProviderId = 'claude' | 'codex' | 'grok';
export type EventKind = 'reset' | 'policy';
export type Delivery = 'immediate' | 'banked' | 'unknown';

export interface ResetEvent {
  id: string;
  provider: ProviderId;
  kind: EventKind;
  delivery: Delivery;
  reason_tags: string[];
  scope: string;
  date: string;
  url: string;
  account: string | null;
  note: string | null;
}

export interface ProviderMeta {
  name: string;
  product: string;
  account: string | null;
  accountUrl: string | null;
  status?: string;
  note?: string;
  events: ResetEvent[];
}

export interface ResetsDataset {
  meta: {
    name: string;
    generatedAt: string;
    attribution: string[];
    definitions: Record<string, string>;
  };
  providers: Record<ProviderId, ProviderMeta>;
}

export interface ProviderSummary {
  name: string;
  product?: string;
  account?: string | null;
  accountUrl?: string | null;
  status?: string;
  note?: string;
  resetCount: number;
  policyChangeCount?: number;
  lastResetAt?: string | null;
  lastResetUrl?: string | null;
  lastResetAccount?: string | null;
  lastResetScope?: string | null;
  firstResetAt?: string | null;
  meanGapDays?: number | null;
  longestGapDays?: number | null;
  daysSinceLast?: number | null;
  pacePerMonth?: number | null;
  deliveryCounts?: Record<string, number>;
  reasonTagCounts?: Record<string, number>;
  datasetAttribution?: string;
}

export interface SummaryDataset {
  site: string;
  name: string;
  generatedAt: string;
  disclaimer: string;
  providers: Record<ProviderId, ProviderSummary>;
  definitions: Record<string, string>;
  urls: Record<string, string>;
}

export interface AnticipationResult {
  provider: ProviderId;
  oddsLabel: 'low' | 'moderate' | 'elevated' | 'high';
  score: number;
  droughtDays: number;
  meanGap: number | null;
  features: { label: string; detail: string; weight: number }[];
  disclaimer: string;
}
