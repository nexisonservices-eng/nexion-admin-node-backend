require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../model/loginmodel");
const Company = require("../model/company");

const MONGO_URI = process.env.MONGO_URI;

const run = async () => {
  if (!MONGO_URI) {
    throw new Error("MONGO_URI is not configured");
  }

  await mongoose.connect(MONGO_URI);

  const candidates = await User.find({
    role: { $ne: "superadmin" },
    isAgentWorkspace: { $ne: true },
    $or: [
      { createdBy: { $exists: false } },
      { createdBy: null },
      { ownerId: { $exists: false } },
      { ownerId: null },
      { parentUserId: { $exists: false } },
      { parentUserId: null }
    ]
  }).lean();

  let updatedCount = 0;
  let skippedCount = 0;

  for (const user of candidates) {
    const companyId = user.companyId ? String(user.companyId) : "";
    const company = companyId ? await Company.findById(companyId).lean() : null;
    const inferredParentId = company?.createdBy ? String(company.createdBy) : "";

    if (!inferredParentId) {
      skippedCount += 1;
      continue;
    }

    const parent = await User.findById(inferredParentId).lean();
    if (!parent) {
      skippedCount += 1;
      continue;
    }

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          createdBy: parent._id,
          ownerId: parent._id,
          parentUserId: parent._id,
          createdByName: parent.username || "",
          isAgentWorkspace: true
        }
      }
    );

    updatedCount += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        examined: candidates.length,
        updated: updatedCount,
        skipped: skippedCount
      },
      null,
      2
    )
  );

  await mongoose.disconnect();
};

run().catch(async (error) => {
  console.error("Backfill failed:", error.message);
  try {
    await mongoose.disconnect();
  } catch {
    // ignore disconnect errors
  }
  process.exitCode = 1;
});
