import { internalMutation, MutationCtx } from "./_generated/server";
import { deleteDeliverableCascade } from "./model/deliverables";

const DAY = 24 * 60 * 60 * 1000;

// Clear every app table. Deliverables go through the cascade helper so their
// dependency edges are removed in the same transaction (no orphans).
async function clearAll(ctx: MutationCtx) {
  for (const table of ["risks", "assumptions", "issues", "statusChanges"] as const) {
    for (const row of await ctx.db.query(table).collect()) await ctx.db.delete(row._id);
  }
  for (const d of await ctx.db.query("deliverables").collect()) {
    await deleteDeliverableCascade(ctx, d._id);
  }
  for (const row of await ctx.db.query("programs").collect()) await ctx.db.delete(row._id);
  for (const row of await ctx.db.query("teams").collect()) await ctx.db.delete(row._id);
}

export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await clearAll(ctx);
    const now = Date.now();

    const programId = await ctx.db.insert("programs", {
      name: "Q3 Platform Launch",
      description: "Cross-team launch of the new payments-enabled platform.",
      startDate: now - 30 * DAY,
      targetDate: now + 60 * DAY,
      status: "active",
    });

    const teams = {
      platform: await ctx.db.insert("teams", { name: "Platform", leadName: "Priya N.", color: "#6366f1" }),
      payments: await ctx.db.insert("teams", { name: "Payments", leadName: "Marco B.", color: "#10b981" }),
      mobile: await ctx.db.insert("teams", { name: "Mobile", leadName: "Sara K.", color: "#f59e0b" }),
      data: await ctx.db.insert("teams", { name: "Data", leadName: "Wei L.", color: "#ef4444" }),
    };

    const d = async (
      title: string, team: keyof typeof teams,
      status: "not_started" | "in_progress" | "blocked" | "done",
      targetOffsetDays: number,
    ) =>
      ctx.db.insert("deliverables", {
        programId, owningTeamId: teams[team], title, status,
        targetDate: now + targetOffsetDays * DAY,
      });

    const authService = await d("Auth Service", "platform", "in_progress", 10);
    const apiGateway = await d("API Gateway", "platform", "in_progress", 15);
    const checkoutApi = await d("Checkout API", "payments", "blocked", 25);
    await d("Billing Ledger", "payments", "not_started", 40); // no dependency edges — realistic "no incidents" node
    const inAppPurchase = await d("In-App Purchase", "mobile", "not_started", 35);
    const appStoreRelease = await d("App Store Release", "mobile", "not_started", 55);
    const dataPipeline = await d("Data Pipeline", "data", "in_progress", 20);
    const analyticsDashboard = await d("Analytics Dashboard", "data", "not_started", 45);
    const reportingService = await d("Reporting Service", "data", "not_started", 50);

    const dep = async (
      provider: typeof authService, consumer: typeof authService,
      rag: "green" | "amber" | "red", isBlocking: boolean,
      neededOffsetDays: number, committedOffsetDays: number | undefined,
      description: string,
    ) =>
      ctx.db.insert("dependencies", {
        providerDeliverableId: provider, consumerDeliverableId: consumer,
        rag, isBlocking, description,
        neededByDate: now + neededOffsetDays * DAY,
        committedDate: committedOffsetDays === undefined ? undefined : now + committedOffsetDays * DAY,
      });

    // Cascade chain (all blocking).
    await dep(authService, checkoutApi, "amber", true, 20, 22, "Checkout needs auth tokens"); // negative slack
    await dep(checkoutApi, inAppPurchase, "red", true, 30, 34, "IAP needs the checkout API"); // negative slack
    await dep(inAppPurchase, appStoreRelease, "green", true, 50, 48, "Release blocked on IAP flow");
    // Supporting realistic edges.
    await dep(authService, apiGateway, "green", true, 12, 9, "Gateway fronts auth");
    await dep(apiGateway, checkoutApi, "amber", false, 24, 24, "Checkout routes through gateway");
    // Planted cycle.
    await dep(dataPipeline, analyticsDashboard, "green", true, 22, 20, "Dashboard consumes pipeline output");
    await dep(analyticsDashboard, reportingService, "amber", false, 45, undefined, "Reports read from dashboard");
    await dep(reportingService, dataPipeline, "red", true, 18, 24, "Pipeline backfill needs report schema"); // cycle-closing, negative slack

    await ctx.db.insert("risks", { programId, owningTeamId: teams.payments, title: "PCI review may slip", description: "External auditor availability uncertain.", probability: 4, impact: 5, mitigation: "Booked provisional audit slot", ownerName: "Marco B.", status: "open" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.platform, title: "Auth vendor rate limits", description: "Load test hit vendor throttling.", probability: 3, impact: 4, mitigation: "Negotiating higher tier", ownerName: "Priya N.", status: "mitigating" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.data, title: "Pipeline/report circular dep", description: "Data Pipeline and Reporting depend on each other.", probability: 5, impact: 3, ownerName: "Wei L.", status: "open" });
    await ctx.db.insert("risks", { programId, owningTeamId: teams.mobile, title: "App Store review delay", description: "Holiday freeze window approaching.", probability: 2, impact: 4, mitigation: "Submitting two weeks early", ownerName: "Sara K.", status: "open" });

    await ctx.db.insert("assumptions", { programId, title: "Single payment provider for v1", description: "We ship with one PSP; multi-PSP is post-launch.", validationStatus: "validated", validateByDate: now - 5 * DAY, ownerName: "Marco B." });
    await ctx.db.insert("assumptions", { programId, title: "Existing SSO covers new app", description: "Assuming corp SSO works for the mobile client.", validationStatus: "unvalidated", validateByDate: now + 14 * DAY, ownerName: "Priya N." });
    await ctx.db.insert("assumptions", { programId, title: "Analytics can reuse warehouse", description: "No new warehouse needed for launch metrics.", validationStatus: "invalidated", validateByDate: now - 2 * DAY, ownerName: "Wei L." });

    await ctx.db.insert("issues", { programId, owningTeamId: teams.payments, title: "Checkout API blocked on auth", description: "Cannot integrate until Auth Service ships tokens.", severity: "high", status: "open", raisedDate: now - 6 * DAY });
    await ctx.db.insert("issues", { programId, owningTeamId: teams.data, title: "Circular dependency detected", description: "Pipeline and Reporting reference each other.", severity: "critical", status: "in_progress", raisedDate: now - 3 * DAY });
    await ctx.db.insert("issues", { programId, owningTeamId: teams.platform, title: "Staging auth flaky", description: "Intermittent 500s from auth in staging.", severity: "medium", status: "resolved", resolution: "Restarted the token cache.", raisedDate: now - 10 * DAY, resolvedDate: now - 8 * DAY });

    return null;
  },
});
