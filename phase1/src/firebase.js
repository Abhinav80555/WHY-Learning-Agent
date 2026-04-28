import admin from "firebase-admin";
import { readFileSync } from "fs";

function initDb() {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return admin.firestore();
    }
    if (process.env.FIREBASE_KEY_PATH) {
      const serviceAccount = JSON.parse(readFileSync(process.env.FIREBASE_KEY_PATH, "utf8"));
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      return admin.firestore();
    }
    console.warn("⚠️  No Firebase credentials found. Using in-memory mock DB for local dev.");
    return createMockDb();
  } catch (err) {
    console.error("Firebase init error:", err.message);
    return createMockDb();
  }
}

function createMockDb() {
  const store = {};
  return {
    collection: (col) => ({
      doc: (id) => ({
        set: async (data, opts) => {
          if (!store[col]) store[col] = {};
          if (opts?.merge && store[col][id]) {
            store[col][id] = { ...store[col][id], ...data };
          } else {
            store[col][id] = data;
          }
        },
        get: async () => ({
          exists: !!store[col]?.[id],
          data: () => store[col]?.[id],
        }),
      }),
      add: async (data) => {
        if (!store[col]) store[col] = {};
        const id = Date.now().toString();
        store[col][id] = data;
        return { id };
      },
      get: async () => ({
        docs: Object.entries(store[col] || {}).map(([id, data]) => ({
          id,
          data: () => data,
        })),
      }),
    }),
  };
}

const db = initDb();

export { db };