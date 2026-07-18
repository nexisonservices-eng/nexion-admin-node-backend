const mongoose = require("mongoose");

const MetaDocumentSchema = new mongoose.Schema(
  {
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: "company", required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "admin", required: true },
    docType: { type: String, required: true },
    url: { type: String, required: true },
    originalFileName: { type: String, default: "" },
    mimeType: { type: String, default: "" },
    sizeBytes: { type: Number, default: 0 },
    cloudinaryPublicId: { type: String, default: "" },
    cloudinaryResourceType: { type: String, default: "auto" },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    notes: String
  },
  { timestamps: true }
);

MetaDocumentSchema.index({ companyId: 1, status: 1, createdAt: -1 });
MetaDocumentSchema.index({ companyId: 1, userId: 1, docType: 1, createdAt: -1 });

module.exports = mongoose.model("meta_document", MetaDocumentSchema);
