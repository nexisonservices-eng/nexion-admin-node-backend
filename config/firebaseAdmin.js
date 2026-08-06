let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = null;
}

const normalizePrivateKey = (key) => {
  if (!key) return key;
  return key.replace(/\\n/g, "\n");
};

const sanitizeServiceAccountJson = (value) => {
  let raw = String(value || "").trim();
  if (!raw) return "";

  if (raw.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON=")) {
    raw = raw.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
  }

  if (
    (raw.startsWith("'") && raw.endsWith("'")) ||
    (raw.startsWith('"') && raw.endsWith('"'))
  ) {
    raw = raw.slice(1, -1).trim();
  }

  if (!raw.startsWith("{")) {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      raw = raw.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  return raw;
};

const normalizeServiceAccount = (serviceAccount = {}) => {
  const normalized = { ...serviceAccount };
  const projectId = String(normalized.project_id || normalized.projectId || normalized.projectID || "").trim();
  const clientEmail = String(normalized.client_email || normalized.clientEmail || "").trim();
  const privateKey = normalizePrivateKey(normalized.private_key || normalized.privateKey || "");
  normalized.project_id = projectId;
  normalized.projectId = projectId;
  normalized.client_email = clientEmail;
  normalized.clientEmail = clientEmail;
  normalized.private_key = privateKey;
  normalized.privateKey = privateKey;
  normalized.private_key_id = String(normalized.private_key_id || normalized.privateKeyId || "").trim();
  normalized.client_id = String(normalized.client_id || normalized.clientId || "").trim();
  return normalized;
};

const initFromEnv = () => {
  if (!admin) return false;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId || !clientEmail || !privateKey) {
    return false;
  }

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });

  return true;
};

const initFromJson = () => {
  if (!admin) return false;
  const json = sanitizeServiceAccountJson(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!json) return false;

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(json);
  } catch (error) {
    const parseError = new Error(`FIREBASE_SERVICE_ACCOUNT_JSON is invalid JSON: ${error.message}`);
    parseError.cause = error;
    throw parseError;
  }
  serviceAccount = normalizeServiceAccount(serviceAccount);
  const credentialPayload = {
    projectId: serviceAccount.projectId,
    clientEmail: serviceAccount.clientEmail,
    privateKey: serviceAccount.privateKey
  };

  if (!credentialPayload.projectId || !credentialPayload.clientEmail || !credentialPayload.privateKey) {
    throw new Error(
      "Firebase service account JSON must include project_id, client_email, and private_key."
    );
  }

  admin.initializeApp({
    credential: admin.credential.cert(credentialPayload)
  });

  return true;
};

const getFirebaseAdmin = () => {
  if (!admin) {
    throw new Error("firebase-admin package is not installed in the current runtime.");
  }
  if (admin.apps.length) return admin;

  const initialized = initFromJson() || initFromEnv();
  if (!initialized) {
    throw new Error(
      "Firebase Admin credentials are not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  return admin;
};

module.exports = { getFirebaseAdmin };
