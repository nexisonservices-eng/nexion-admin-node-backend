const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const { ensureCompanyFolders, sanitizeCompanyName } = require("../config/cloudinary");
const { createTrialSubscription } = require("../utils/billing");
const { buildSubscriptionContext } = require("./billingController");

const registeruser = async (req, res) => {
  try {
    const { username, email, password, companyName } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields required" });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "User already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({
      username,
      email,
      password: hashedPassword,
      role: "user",
      createdBy: null,
      createdByName: null,
      authProvider: "email"
    });

    const resolvedCompanyName = companyName || username || email;
    const company = await Company.create({
      name: resolvedCompanyName,
      slug: sanitizeCompanyName(resolvedCompanyName),
      createdBy: newUser._id,
      status: "active"
    });

    await ensureCompanyFolders({
      companyName: company.name,
      companyId: company._id
    });

    newUser.companyId = company._id;
    newUser.companyRole = "admin";
    await newUser.save();

    await createTrialSubscription({
      companyId: company._id,
      userId: newUser._id
    });

    const billing = await buildSubscriptionContext(newUser);
    const token = jwt.sign(
      {
        userId: newUser._id,
        id: newUser._id,
        email: newUser.email,
        role: newUser.role,
        companyId: newUser.companyId,
        companyRole: newUser.companyRole,
        planCode: billing.planCode,
        featureFlags: billing.featureFlags,
        subscriptionStatus: billing.subscriptionStatus,
        workspaceAccessState: billing.workspaceAccessState,
        canPerformActions: billing.canPerformActions,
        canViewAnalytics: billing.canViewAnalytics
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    return res.status(201).json({
      role: newUser.role,
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        userId: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        companyId: newUser.companyId || null,
        companyRole: newUser.companyRole || "admin",
        companyName: company.name || "",
        ...billing
      }
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

module.exports = { registeruser };
