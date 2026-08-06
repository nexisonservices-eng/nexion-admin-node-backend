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
  normalized.project_id = normalized.project_id || normalized.projectId || normalized.projectID;
  normalized.client_email = normalized.client_email || normalized.clientEmail;
  normalized.private_key = normalizePrivateKey(normalized.private_key || normalized.privateKey);
  normalized.private_key_id = normalized.private_key_id || normalized.privateKeyId;
  normalized.client_id = normalized.client_id || normalized.clientId;
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

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
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
