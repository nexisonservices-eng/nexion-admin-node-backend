const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/loginmodel");
const Company = require("../model/company");
const Subscription = require("../model/subscription");
const { ensureCompanyFolders, sanitizeCompanyName } = require("../config/cloudinary");
const { getDefaultTrial, buildPlanContext } = require("../utils/planUtils");

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

    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      role: "user",
      createdBy: null,
      createdByName: null,
      authProvider: "email",
    });

    await newUser.save();

    const trial = getDefaultTrial();
    const resolvedCompanyName = companyName || username || email;
    const slug = sanitizeCompanyName(resolvedCompanyName);
    const company = await Company.create({
      name: resolvedCompanyName,
      slug,
      createdBy: newUser._id,
      status: "active",
      trialStart: trial.trialStart,
      trialEnd: trial.trialEnd
    });

    await ensureCompanyFolders({
      companyName: company.name,
      companyId: company._id
    });

    await Subscription.create({
      companyId: company._id,
      planCode: "trial",
      status: "active",
      billingCycle: "trial",
      startsAt: trial.trialStart,
      endsAt: trial.trialEnd,
      featureFlags: trial.featureFlags,
      limits: trial.limits
    });

    newUser.companyId = company._id;
    newUser.companyRole = "admin";
    await newUser.save();

    const planContext = await buildPlanContext(company._id);

    const token = jwt.sign(
      {
        userId: newUser._id,
        role: newUser.role,
        companyId: newUser.companyId,
        companyRole: newUser.companyRole,
        planCode: planContext.planCode,
        featureFlags: planContext.featureFlags,
        subscriptionStatus: planContext.subscriptionStatus
      },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.status(201).json({
       role: newUser.role,
      message: "User registered successfully",
      token,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = { registeruser };
