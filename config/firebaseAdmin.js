const fs = require("fs");
const path = require("path");

let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = null;
}

const LOCAL_SERVICE_ACCOUNT_PATH = path.join(__dirname, "nexion-98f7c-4e49040efb6b.json");
const RENDER_SERVICE_ACCOUNT_PATH = "/etc/secrets/firebase-service-account.json";

let firebaseAdminInitAttempted = false;
let firebaseAdminInitError = null;

const normalizePrivateKey = (key) => {
  if (!key) return key;
  return key.replace(/\\n/g, "\n");
};

const normalizeServiceAccount = (serviceAccount = {}) => {
  const normalized = { ...serviceAccount };
  const projectId = String(
    normalized.project_id || normalized.projectId || normalized.projectID || ""
  ).trim();
  const clientEmail = String(normalized.client_email || normalized.clientEmail || "").trim();
  const privateKey = normalizePrivateKey(normalized.private_key || normalized.privateKey || "");

  normalized.project_id = projectId;
  normalized.projectId = projectId;
  normalized.client_email = clientEmail;
  normalized.clientEmail = clientEmail;
  normalized.private_key = privateKey;
  normalized.privateKey = privateKey;
  normalized.private_key_id = String(
    normalized.private_key_id || normalized.privateKeyId || ""
  ).trim();
  normalized.client_id = String(normalized.client_id || normalized.clientId || "").trim();

  return normalized;
};

const buildCredentialCandidates = () => {
  const candidates = [];
  const envCredentialPath = String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim();

  if (envCredentialPath) {
    candidates.push(envCredentialPath);
  }

  candidates.push(RENDER_SERVICE_ACCOUNT_PATH);
  candidates.push(LOCAL_SERVICE_ACCOUNT_PATH);

  return candidates;
};

const readServiceAccountFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Firebase Admin] Credential file missing: ${filePath}`);
    return null;
  }

  console.log(`[Firebase Admin] Credential file found: ${filePath}`);

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const initializeFirebaseAdmin = () => {
  if (!admin) {
    throw new Error("firebase-admin package is not installed in the current runtime.");
  }

  if (admin.apps.length) {
    return admin;
  }

  if (firebaseAdminInitAttempted) {
    if (firebaseAdminInitError) {
      throw firebaseAdminInitError;
    }

    return admin;
  }

  firebaseAdminInitAttempted = true;

  try {
    const candidates = buildCredentialCandidates();
    let serviceAccount = null;
    let lastReadError = null;

    for (const candidate of candidates) {
      try {
        const parsed = readServiceAccountFile(candidate);
        if (parsed) {
          serviceAccount = parsed;
          break;
        }
      } catch (error) {
        lastReadError = error;
        console.error(
          `[Firebase Admin] Failed to read credential file: ${candidate} (${error.message})`
        );
      }
    }

    if (!serviceAccount) {
      const error = lastReadError || new Error("No Firebase credential file was found.");
      throw error;
    }

    const normalizedServiceAccount = normalizeServiceAccount(serviceAccount);
    const credentialPayload = {
      projectId: normalizedServiceAccount.projectId,
      clientEmail: normalizedServiceAccount.clientEmail,
      privateKey: normalizedServiceAccount.privateKey
    };

    if (
      !credentialPayload.projectId ||
      !credentialPayload.clientEmail ||
      !credentialPayload.privateKey
    ) {
      throw new Error(
        "Firebase service account JSON must include project_id, client_email, and private_key."
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(credentialPayload)
    });

    console.log("[Firebase Admin] Initialized successfully");
    return admin;
  } catch (error) {
    firebaseAdminInitError = error;
    console.error(`[Firebase Admin] Initialization failed: ${error.message}`);
    throw error;
  }
};

const getFirebaseAdmin = () => initializeFirebaseAdmin();

module.exports = { getFirebaseAdmin };
