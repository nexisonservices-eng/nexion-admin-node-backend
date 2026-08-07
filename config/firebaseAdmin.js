const fs = require("fs");
const path = require("path");

let admin;
try {
  admin = require("firebase-admin");
} catch {
  admin = null;
}

const LOCAL_SERVICE_ACCOUNT_PATHS = [
  path.join(__dirname, "firebase-service-account.json"),
  path.join(__dirname, "nexion-98f7c-4e49040efb6b.json")
];
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
  const envServiceAccountJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();

  if (envCredentialPath) {
    candidates.push(envCredentialPath);
  }

  candidates.push(RENDER_SERVICE_ACCOUNT_PATH);
  candidates.push(...LOCAL_SERVICE_ACCOUNT_PATHS);
  if (envServiceAccountJson) {
    candidates.push({ type: "json", value: envServiceAccountJson });
  }

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

const readServiceAccountJson = (rawJson) => {
  let json = String(rawJson || "").trim();
  if (!json) return null;

  if (json.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON=")) {
    json = json.slice("FIREBASE_SERVICE_ACCOUNT_JSON=".length).trim();
  }

  if ((json.startsWith("'") && json.endsWith("'")) || (json.startsWith('"') && json.endsWith('"'))) {
    json = json.slice(1, -1).trim();
  }

  if (!json.startsWith("{")) {
    const firstBrace = json.indexOf("{");
    const lastBrace = json.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      json = json.slice(firstBrace, lastBrace + 1).trim();
    }
  }

  if (!json) return null;

  console.log("[Firebase Admin] Credential source found: FIREBASE_SERVICE_ACCOUNT_JSON");
  return JSON.parse(json);
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
        const parsed =
          typeof candidate === "string"
            ? readServiceAccountFile(candidate)
            : readServiceAccountJson(candidate.value);
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
