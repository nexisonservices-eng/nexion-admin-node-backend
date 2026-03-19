const Company = require("../model/company");
const { buildPlanContext } = require("../utils/planUtils");

const requireCompany = async (req, res, next) => {
  const companyId = req.user?.companyId || req.user?.companyId;
  if (!companyId) {
    return res.status(400).json({ message: "Company context missing" });
  }
  const company = await Company.findById(companyId).lean();
  if (!company || company.status === "disabled") {
    return res.status(403).json({ message: "Company is disabled" });
  }
  req.company = company;
  next();
};

const requirePlanFeature = (feature) => async (req, res, next) => {
  try {
    const companyId = req.user?.companyId;
    const planContext = await buildPlanContext(companyId);
    const allowed = planContext.featureFlags?.[feature];
    if (!allowed) {
      return res.status(403).json({ message: "Feature not enabled for plan" });
    }
    req.planContext = planContext;
    next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to validate plan", error: error.message });
  }
};

module.exports = {
  requireCompany,
  requirePlanFeature
};
