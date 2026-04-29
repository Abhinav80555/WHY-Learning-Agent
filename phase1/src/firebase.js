import admin from "firebase-admin";

function initDb() {
  try {
    if (process.env.FIREBASE_PROJECT_ID) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
      });
      console.log("✅ Firebase connected");
      return admin.firestore();
    }
    console.warn("⚠️  No Firebase credentials. Using in-memory mock DB.");
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