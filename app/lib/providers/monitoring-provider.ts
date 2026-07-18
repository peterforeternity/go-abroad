import { getRuntimeConfig } from "../env";
import { logInfo, logWarn } from "../logger";
import type { MonitoringProvider } from "./types";

class ConsoleMonitoringProvider implements MonitoringProvider {
  async captureException(error: unknown, context: Record<string, unknown> = {}): Promise<void> {
    logWarn("monitoring_console_exception", {
      ...context,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }

  async trackEvent(name: string, context: Record<string, unknown> = {}): Promise<void> {
    logInfo("monitoring_console_event", { name, ...context });
  }
}

class UnavailableMonitoringProvider implements MonitoringProvider {
  async captureException(_error: unknown, context: Record<string, unknown> = {}): Promise<void> {
    logWarn("monitoring_not_configured", context);
  }

  async trackEvent(name: string, context: Record<string, unknown> = {}): Promise<void> {
    logWarn("monitoring_not_configured", { name, ...context });
  }
}

export function getMonitoringProvider(): MonitoringProvider {
  try {
    return getRuntimeConfig().appEnv === "development"
      ? new ConsoleMonitoringProvider()
      : new UnavailableMonitoringProvider();
  } catch {
    return new UnavailableMonitoringProvider();
  }
}
