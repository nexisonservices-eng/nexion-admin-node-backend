const jwt = require("jsonwebtoken");
const User = require("../model/loginmodel");

const JWT_SECRET = process.env.JWT_SECRET;

const protect = async (req, res, next) => {
  let token;
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ message: "JWT_SECRET is not configured" });
    }
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];

      // Decode token
      const decoded = jwt.verify(token, JWT_SECRET);

      // Attach user to request
      req.user = {
        id: decoded.userId || decoded.id,
        username: decoded.username || null,
        email: decoded.email || null,
        role: decoded.role || null,
        companyId: decoded.companyId || null,
        companyRole: decoded.companyRole || "user",
        planCode: decoded.planCode || "",
        featureFlags: decoded.featureFlags || {},
        subscriptionStatus: decoded.subscriptionStatus || "",
        workspaceAccessState: decoded.workspaceAccessState || "",
        canPerformActions: typeof decoded.canPerformActions === "boolean" ? decoded.canPerformActions : true,
        canViewAnalytics: typeof decoded.canViewAnalytics === "boolean" ? decoded.canViewAnalytics : true,
        isEnabled:
          typeof decoded.isEnabled === "boolean"
            ? decoded.isEnabled
            : Boolean(decoded.canAccessAgentManagement || decoded.canAccessUserManagement),
        createdBy: decoded.createdBy || null,
        ownerId: decoded.ownerId || decoded.createdBy || null,
        parentUserId: decoded.parentUserId || decoded.createdBy || null,
        createdByName: decoded.createdByName || null
      };

      if (!req.user.id) {
        return res.status(401).json({ message: "Invalid token payload" });
      }

      if (typeof decoded.isAgentWorkspace !== "boolean" && req.user.id) {
        try {
          const hydratedUser = await User.findById(req.user.id)
            .select("_id companyId createdBy ownerId parentUserId createdByName isAgentWorkspace isEnabled")
            .lean();
          if (hydratedUser) {
            req.user = {
              ...req.user,
              companyId: hydratedUser.companyId || req.user.companyId || null,
              createdBy: hydratedUser.createdBy || req.user.createdBy || null,
              ownerId: hydratedUser.ownerId || req.user.ownerId || hydratedUser.createdBy || null,
              parentUserId: hydratedUser.parentUserId || req.user.parentUserId || hydratedUser.createdBy || null,
              createdByName: hydratedUser.createdByName || req.user.createdByName || null,
              isAgentWorkspace: hydratedUser.isAgentWorkspace === true,
              isEnabled: typeof hydratedUser.isEnabled === "boolean" ? hydratedUser.isEnabled : req.user.isEnabled
            };
          }
        } catch {
          // If hydration fails, continue with token claims.
        }
      }

      if (req.user.isAgentWorkspace === true && req.user.isEnabled === false) {
        return res.status(403).json({ message: "Account is disabled" });
      }

      next();
    } else {
      return res.status(401).json({ message: "Not authorized" });
    }
  } catch (error) {
    return res.status(401).json({ message: "Token failed", error: error.message });
  }
};

module.exports = protect;
