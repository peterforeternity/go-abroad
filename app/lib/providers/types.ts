import type { InsightType, StudyAbroadPayload } from "../study-abroad-data";

export type StudyDataQuery = {
  q?: string;
  country?: string;
  type?: InsightType;
  limit?: number;
};

export type StudyDataSnapshot = StudyAbroadPayload;

export type StudyDataSyncResult = {
  synced: boolean;
  source: string;
  dataVersion: string;
  lastSyncedAt: string | null;
  message: string;
};

export type AuthUser = {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
};

export type AuthProvider = {
  getUser(request: Request): Promise<AuthUser | null>;
  requireUser(request: Request): Promise<AuthUser>;
};

export type EmailProvider = {
  sendVerificationEmail(input: { email: string; token: string; returnUrl: string }): Promise<void>;
  sendPasswordResetEmail(input: { email: string; token: string; returnUrl: string }): Promise<void>;
};

export type CacheProvider = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
};

export type MonitoringProvider = {
  captureException(error: unknown, context?: Record<string, unknown>): Promise<void>;
  trackEvent(name: string, context?: Record<string, unknown>): Promise<void>;
};

export type StudyDataProvider = {
  getSnapshot(query: StudyDataQuery): Promise<StudyDataSnapshot>;
  sync(): Promise<StudyDataSyncResult>;
};

export class ProviderNotConfiguredError extends Error {
  readonly status = 503;
  readonly publicMessage: string;

  constructor(readonly code: string, publicMessage: string) {
    super(publicMessage);
    this.name = "ProviderNotConfiguredError";
    this.publicMessage = publicMessage;
  }
}

export class UpstreamProviderError extends Error {
  readonly status = 502;
  readonly publicMessage = "上游数据服务暂时不可用，请稍后重试";

  constructor(readonly code: string, message?: string) {
    super(message ?? code);
    this.name = "UpstreamProviderError";
  }
}
