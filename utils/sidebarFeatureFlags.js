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

const SIDEBAR_ACCESS_GROUPS = [
  {
    key: "inbox",
    label: "Inbox",
    description: "Show the Inbox entry in the sidebar.",
    items: [{ flag: "teamInbox", label: "Inbox" }]
  },
  {
    key: "bulkMessages",
    label: "Bulk Messages",
    description: "Show Bulk Messages and its submenu items.",
    items: [
      { flag: "broadcastDashboard", label: "Campaigns" },
      { flag: "teamInbox", label: "Team Inbox" },
      { flag: "broadcastMessaging", label: "Broadcast" },
      { flag: "templates", label: "Templates" },
      { flag: "contacts", label: "Contacts" }
    ]
  },
  {
    key: "crm",
    label: "CRM",
    description: "Show CRM and its workspace sections.",
    items: [
      { flag: "crmHome", label: "CRM Home" },
      { flag: "crmPipeline", label: "Pipeline" },
      { flag: "crmTasks", label: "Tasks" },
      { flag: "crmDeals", label: "Deals" },
      { flag: "crmMeetings", label: "Meetings" },
      { flag: "crmReports", label: "Reports" },
      { flag: "crmOps", label: "Follow-up Ops" },
      { flag: "crmLeadScoringSettings", label: "Lead Scoring Settings" },
      { flag: "crmTaskCalendar", label: "Task Calendar" }
    ]
  },
  {
    key: "metaAds",
    label: "Meta Ads",
    description: "Show Meta Ads and related insights/connect pages.",
    items: [
      { flag: "adsManager", label: "Campaigns" },
      { flag: "analytics", label: "Reports" },
      { flag: "metaConnect", label: "Connect Meta" },
      { flag: "metaLeads", label: "Leads" }
    ]
  },
  {
    key: "voice",
    label: "Voice",
    description: "Show Voice and its calling tools.",
    items: [
      { flag: "voiceCampaign", label: "Voice Broadcast" },
      { flag: "inboundAutomation", label: "Inbound / IVR" },
      { flag: "outboundVoice", label: "Outbound" },
      { flag: "callAnalytics", label: "Call Analytics" }
    ]
  },
  {
    key: "missed",
    label: "Missed",
    description: "Show the Missed Calls entry in the sidebar.",
    items: [{ flag: "missedCall", label: "Missed Calls" }]
  },
  {
    key: "email",
    label: "Email",
    description: "Show the Email automation entry in the sidebar.",
    items: [{ flag: "workflowAutomation", label: "Email Automation" }]
  }
];

module.exports = {
  SIDEBAR_ACCESS_FLAG_KEYS,
  SIDEBAR_ACCESS_DEFAULTS,
  normalizeSidebarFeatureFlags,
  hasSidebarAccessSelection,
  collapseSidebarFeatureFlags,
  SIDEBAR_ACCESS_GROUPS
};
