export type JournalEntry = {
  date: string;
  text: string;
  updatedAt: string;
  favorite?: boolean;
};

const DATABASE_NAME = 'little-orbit';
const LEGACY_DATABASE_NAME = ['flowery', 'day'].join('-');
const STORE_NAME = 'entries';

function openDatabase(databaseName = DATABASE_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'date' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readEntries(databaseName = DATABASE_NAME): Promise<JournalEntry[]> {
  const database = await openDatabase(databaseName);
  return new Promise((resolve, reject) => {
    const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    request.onsuccess = () => {
      const entries = request.result as JournalEntry[];
      database.close();
      resolve(entries);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

function transactionComplete(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function getEntries(): Promise<JournalEntry[]> {
  const entries = await readEntries();
  if (entries.length) return entries;

  const legacyEntries = await readEntries(LEGACY_DATABASE_NAME);
  if (!legacyEntries.length) return [];
  await putEntries(legacyEntries);
  indexedDB.deleteDatabase(LEGACY_DATABASE_NAME);
  return legacyEntries;
}

export async function putEntry(entry: JournalEntry) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).put(entry);
  await transactionComplete(transaction);
  database.close();
}

export async function putEntries(entries: JournalEntry[]) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  entries.forEach((entry) => store.put(entry));
  await transactionComplete(transaction);
  database.close();
}

export async function deleteEntry(date: string) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).delete(date);
  await transactionComplete(transaction);
  database.close();
}

export async function clearEntries() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  transaction.objectStore(STORE_NAME).clear();
  await transactionComplete(transaction);
  database.close();
}
