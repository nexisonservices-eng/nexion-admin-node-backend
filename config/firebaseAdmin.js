const admin = require("firebase-admin");

const normalizePrivateKey = (key) => {
  if (!key) return key;
  return key.replace(/\\n/g, "\n");
};

const initFromEnv = () => {
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
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) return false;

  const serviceAccount = JSON.parse(json);
  if (serviceAccount.private_key) {
    serviceAccount.private_key = normalizePrivateKey(serviceAccount.private_key);
  }

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });

  return true;
};

const getFirebaseAdmin = () => {
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
