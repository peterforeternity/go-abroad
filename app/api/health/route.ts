import { jsonSuccess, withApiHandler } from "../../lib/api";
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
    const authenticationReady = databaseReady &&
      validation.config.authProviderMode === "d1" &&
      (validation.config.sessionSecret?.length ?? 0) >= 32;
    const emailReady = validation.config.emailProviderMode === "resend" &&
      Boolean(validation.config.emailProviderApiKey && validation.config.emailFrom);
    const ready = validation.ok && databaseReady && studyDataReady;

    return jsonSuccess(
      {
        status: ready ? "ok" : "degraded",
        ready,
        environment: validation.config.appEnv,
        checks: {
          configuration: validation.ok,
          database: databaseReady,
          studyDataProvider: studyDataReady,
          demoData: validation.config.dataProviderMode === "demo",
          authentication: authenticationReady,
          email: emailReady,
        },
        issueKeys: validation.issues.map((issue) => issue.key),
        generatedAt: new Date().toISOString(),
      },
      requestId,
    );
  });
}
