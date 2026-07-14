import { jsonSuccess, ApiError, withApiHandler } from "../../lib/api";
import { hasDbBinding } from "../../../db";
import { validateRuntimeEnv } from "../../lib/env";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return withApiHandler(request, async ({ requestId }) => {
    const validation = validateRuntimeEnv();
    const databaseReady = hasDbBinding();
    const studyDataReady = validation.config.dataProviderMode === "demo"
      ? validation.config.appEnv === "development" && validation.config.allowDemoData
      : Boolean(validation.config.dataProviderBaseUrl && validation.config.dataProviderApiKey);
    const ready = validation.ok && databaseReady && studyDataReady;

    if (validation.config.appEnv !== "development" && !ready) {
      throw new ApiError(
        503,
        "SERVICE_NOT_READY",
        "服务尚未完成生产配置",
        {
          checks: {
            configuration: validation.ok,
            database: databaseReady,
            studyDataProvider: studyDataReady,
          },
          issueKeys: validation.issues.map((issue) => issue.key),
        },
      );
    }

    return jsonSuccess(
      {
        status: ready ? "ok" : "degraded",
        environment: validation.config.appEnv,
        checks: {
          configuration: validation.ok,
          database: databaseReady,
          studyDataProvider: studyDataReady,
          demoData: validation.config.dataProviderMode === "demo",
        },
        generatedAt: new Date().toISOString(),
      },
      requestId,
    );
  });
}
