const SIDEBAR_ACCESS_FLAG_KEYS = [
  "teamInbox",
  "broadcastDashboard",
  "broadcastMessaging",
  "templates",
  "contacts",
  "crmHome",
  "crmPipeline",
  "crmTasks",
  "crmDeals",
  "crmMeetings",
  "crmReports",
  "crmOps",
  "crmLeadScoringSettings",
  "crmTaskCalendar",
  "adsManager",
  "analytics",
  "metaConnect",
  "metaLeads",
  "voiceCampaign",
  "inboundAutomation",
  "outboundVoice",
  "callAnalytics",
  "missedCall",
  "workflowAutomation"
];

const SIDEBAR_ACCESS_DEFAULTS = SIDEBAR_ACCESS_FLAG_KEYS.reduce((accumulator, key) => {
  accumulator[key] = false;
  return accumulator;
}, {});

const normalizeSidebarFeatureFlags = (flags = {}) => {
  const source = flags && typeof flags === "object" ? flags : {};
  return SIDEBAR_ACCESS_FLAG_KEYS.reduce(
    (accumulator, key) => {
      accumulator[key] = Boolean(source[key]);
      return accumulator;
    },
    { ...SIDEBAR_ACCESS_DEFAULTS }
  );
};

const hasSidebarAccessSelection = (flags = {}) =>
  SIDEBAR_ACCESS_FLAG_KEYS.some((key) => Boolean(flags?.[key]));

const collapseSidebarFeatureFlags = (flags = {}) =>
  hasSidebarAccessSelection(flags) ? normalizeSidebarFeatureFlags(flags) : {};

module.exports = {
  SIDEBAR_ACCESS_FLAG_KEYS,
  SIDEBAR_ACCESS_DEFAULTS,
  normalizeSidebarFeatureFlags,
  hasSidebarAccessSelection,
  collapseSidebarFeatureFlags
};
