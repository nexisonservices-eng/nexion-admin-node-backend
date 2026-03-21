const MetaDocument = require("../model/metaDocument");
const { cloudinary, configureCloudinary, isCloudinaryConfigured } = require("../config/cloudinary");

const emitDocumentEvents = (req, payload = {}) => {
  const io = req.app.get("io");
  if (!io) return;
  io.emit("documents.updated", payload);
  io.emit("workspace.access.updated", payload);
};

const uploadMetaDocument = async (req, res) => {
  try {
    const { docType } = req.body;
    if (!docType) {
      return res.status(400).json({ message: "docType is required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "Document file is required" });
    }

    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ message: "Cloudinary is not configured" });
    }

    configureCloudinary();
    const folder = req.company?.folderRoot
      ? `${req.company.folderRoot}/documents`
      : `technova/${req.company?.slug || "company"}_${req.company?._id}/documents`;

    const uploadResult = await cloudinary.uploader.upload_stream(
      { folder, resource_type: "auto" },
      async (error, result) => {
        if (error) {
          console.error("Cloudinary upload failed:", error);
          return res.status(500).json({
            message: "Cloudinary upload failed",
            error: error.message || "Upload error"
          });
        }

        const doc = await MetaDocument.create({
          companyId: req.user.companyId,
          userId: req.user.id,
          docType,
          url: result.secure_url,
          status: "pending"
        });

        emitDocumentEvents(req, {
          companyId: String(req.user.companyId || ""),
          userId: String(req.user.id || ""),
          documentStatus: "pending"
        });

        res.status(201).json({ success: true, data: doc });
      }
    );

    uploadResult.end(req.file.buffer);
  } catch (error) {
    res.status(500).json({ message: "Meta document upload failed", error: error.message });
  }
};

const listMetaDocuments = async (req, res) => {
  try {
    const query = { companyId: req.user.companyId };
    if (req.query.status) query.status = req.query.status;
    const docs = await MetaDocument.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch documents", error: error.message });
  }
};

const listMetaDocumentsAdmin = async (req, res) => {
  try {
    const query = {};
    if (req.query.status) query.status = req.query.status;
    if (req.query.companyId) query.companyId = req.query.companyId;

    const docs = await MetaDocument.find(query)
      .sort({ createdAt: -1 })
      .populate("companyId", "name slug")
      .populate("userId", "username email")
      .lean();

    res.json({ success: true, data: docs });
  } catch (error) {
    res.status(500).json({ message: "Failed to fetch documents", error: error.message });
  }
};

const approveMetaDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const nextStatus = status || "approved";
    const doc = await MetaDocument.findByIdAndUpdate(
      id,
      { status: nextStatus, notes: notes || "" },
      { new: true }
    );
    if (!doc) {
      return res.status(404).json({ message: "Document not found" });
    }
    emitDocumentEvents(req, {
      companyId: String(doc.companyId || ""),
      userId: String(doc.userId || ""),
      documentStatus: nextStatus
    });
    res.json({ success: true, data: doc });
  } catch (error) {
    res.status(500).json({ message: "Failed to update document", error: error.message });
  }
};

module.exports = {
  uploadMetaDocument,
  listMetaDocuments,
  approveMetaDocument,
  listMetaDocumentsAdmin
};
