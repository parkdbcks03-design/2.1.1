/*
 * Exam Life 2028 — IndexedDB data layer
 * IMPORTANT: Keep DB_NAME stable. Never delete this database during app updates.
 * Schema changes must increment DB_VERSION and add an incremental migration below.
 */
export const DB_NAME = 'examLife2028';
export const DB_VERSION = 4;

export const STORES = [
  'studyEntries', 'schedules', 'exams', 'majorExams', 'books',
  'meals', 'exercises', 'diaries', 'events', 'attendance',
  'settings', 'auditLog', 'trash', 'periodTasks', 'wishVault', 'dailyStudy'
];

// 삭제 시 휴지통으로 복사해 두는 기록 저장소
export const TRASHABLE = ['studyEntries', 'schedules', 'exams', 'majorExams', 'books', 'meals', 'exercises', 'diaries', 'events', 'periodTasks', 'wishVault', 'dailyStudy'];

let dbPromise;

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 요청에 실패했습니다.'));
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const database = request.result;
      const oldVersion = event.oldVersion;

      // Migration 0 -> 1: initial schema. Future migrations must be additive.
      if (oldVersion < 1) {
        const study = database.createObjectStore('studyEntries', { keyPath: 'id' });
        study.createIndex('date', 'date', { unique: false });
        study.createIndex('subject', 'subject', { unique: false });
        study.createIndex('date_subject', ['date', 'subject'], { unique: false });

        const schedules = database.createObjectStore('schedules', { keyPath: 'id' });
        schedules.createIndex('date', 'date', { unique: false });
        schedules.createIndex('recurrenceId', 'recurrenceId', { unique: false });
        schedules.createIndex('date_recurrence', ['date', 'recurrenceId'], { unique: false });

        const exams = database.createObjectStore('exams', { keyPath: 'id' });
        exams.createIndex('date', 'date', { unique: false });
        exams.createIndex('subject', 'subject', { unique: false });

        const major = database.createObjectStore('majorExams', { keyPath: 'id' });
        major.createIndex('date', 'date', { unique: false });

        const books = database.createObjectStore('books', { keyPath: 'id' });
        books.createIndex('subject', 'subject', { unique: false });
        books.createIndex('status', 'status', { unique: false });

        for (const name of ['meals', 'exercises', 'diaries', 'events']) {
          const store = database.createObjectStore(name, { keyPath: 'id' });
          store.createIndex('date', 'date', { unique: false });
        }

        const attendance = database.createObjectStore('attendance', { keyPath: 'date' });
        attendance.createIndex('date', 'date', { unique: true });

        database.createObjectStore('settings', { keyPath: 'key' });
        const audit = database.createObjectStore('auditLog', { keyPath: 'id' });
        audit.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Migration 1 -> 2: 휴지통 저장소 추가 (기존 데이터는 건드리지 않음)
      if (oldVersion < 2) {
        const trash = database.createObjectStore('trash', { keyPath: 'id' });
        trash.createIndex('deletedAt', 'deletedAt', { unique: false });
      }

      // Migration 2 -> 3: 독립 기간별 할 일과 암호화 보물상자 저장소 추가.
      // 기존 저장소·레코드는 변경하거나 삭제하지 않습니다.
      if (oldVersion < 3) {
        const periodTasks = database.createObjectStore('periodTasks', { keyPath: 'id' });
        periodTasks.createIndex('startDate', 'startDate', { unique: false });
        periodTasks.createIndex('endDate', 'endDate', { unique: false });
        periodTasks.createIndex('completed', 'completed', { unique: false });

        database.createObjectStore('wishVault', { keyPath: 'id' });
      }

      // Migration 3 -> 4: 월별 달력의 하루 공부 시간 요약 저장소 추가.
      // 기존 저장소와 기록은 변경하거나 삭제하지 않습니다.
      if (oldVersion < 4) {
        const dailyStudy = database.createObjectStore('dailyStudy', { keyPath: 'date' });
        dailyStudy.createIndex('date', 'date', { unique: true });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        dbPromise = null;
        window.dispatchEvent(new CustomEvent('db-version-change'));
      };
      resolve(database);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error || new Error('데이터베이스를 열 수 없습니다.'));
    };
    request.onblocked = () => {
      window.dispatchEvent(new CustomEvent('db-open-blocked'));
    };
  });
  return dbPromise;
}

export async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const result = await requestResult(tx.objectStore(storeName).getAll());
  return result;
}

export async function getById(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return requestResult(tx.objectStore(storeName).get(key));
}

const TIMESTAMPED_STORES = new Set([
  'studyEntries', 'schedules', 'exams', 'majorExams', 'books',
  'meals', 'exercises', 'diaries', 'events', 'periodTasks', 'wishVault', 'dailyStudy'
]);

export async function put(storeName, record) {
  const db = await openDB();
  const now = new Date().toISOString();
  // 모든 신규 기록에 입력 시각을 공통으로 남깁니다. 기존 입력 시각은 수정하지 않습니다.
  const storedRecord = TIMESTAMPED_STORES.has(storeName)
    ? { ...record, createdAt: record.createdAt || now, inputAt: record.inputAt || record.createdAt || now }
    : record;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(storedRecord);
    tx.oncomplete = () => resolve(storedRecord);
    tx.onerror = () => reject(tx.error || new Error('저장에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('저장이 취소되었습니다.'));
  });
}

export async function remove(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const soft = TRASHABLE.includes(storeName);
    const tx = db.transaction(soft ? [storeName, 'trash'] : storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    if (soft) {
      // 같은 트랜잭션에서 휴지통에 복사한 뒤 삭제 → 둘 다 성공하거나 둘 다 취소됨
      const get = store.get(key);
      get.onsuccess = () => {
        if (get.result !== undefined) {
          tx.objectStore('trash').put({ id: crypto.randomUUID(), store: storeName, key, record: get.result, deletedAt: new Date().toISOString() });
        }
        store.delete(key);
      };
    } else {
      store.delete(key);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('삭제에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('삭제가 취소되었습니다.'));
  });
}

export async function restoreFromTrash(trashId) {
  const row = await getById('trash', trashId);
  if (!row) throw new Error('휴지통에서 해당 기록을 찾을 수 없습니다.');
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction([row.store, 'trash'], 'readwrite');
    tx.objectStore(row.store).put(row.record);
    tx.objectStore('trash').delete(trashId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('복구에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('복구가 취소되었습니다.'));
  });
  return row;
}

export async function purgeTrash(trashId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('trash', 'readwrite');
    tx.objectStore('trash').delete(trashId);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('영구 삭제에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('영구 삭제가 취소되었습니다.'));
  });
}

export async function getSetting(key, fallback = null) {
  const row = await getById('settings', key);
  return row ? row.value : fallback;
}

export async function setSetting(key, value) {
  return put('settings', { key, value, updatedAt: new Date().toISOString() });
}

export async function addAudit(action, details = {}) {
  return put('auditLog', {
    id: crypto.randomUUID(), action, details,
    timestamp: new Date().toISOString()
  });
}

export async function getDateRange(storeName, from, to) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  if (!store.indexNames.contains('date')) return (await requestResult(store.getAll())).filter(x => x.date >= from && x.date <= to);
  const range = IDBKeyRange.bound(from, to);
  return requestResult(store.index('date').getAll(range));
}

export async function storageStatus() {
  const estimate = navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  let persisted = false;
  try { persisted = navigator.storage?.persisted ? await navigator.storage.persisted() : false; } catch { /* unsupported */ }
  return {
    persisted,
    quota: estimate?.quota ?? null,
    usage: estimate?.usage ?? null,
    usageDetails: estimate?.usageDetails ?? null
  };
}

// A backup is decoded and validated before opening a single readwrite transaction.
// Replacement is atomic across all object stores; merge never overwrites existing IDs.
export async function restoreDatabase(payload, mode = 'merge') {
  if (!payload || payload.format !== 'exam-life-backup' || !Number.isInteger(payload.schemaVersion)) {
    throw new Error('백업 파일 형식이 올바르지 않습니다.');
  }
  if (payload.schemaVersion > DB_VERSION) {
    throw new Error('이 백업은 현재 앱보다 높은 데이터베이스 버전으로 만들어졌습니다. 앱을 업데이트한 뒤 다시 시도하세요.');
  }
  if (!payload.stores || typeof payload.stores !== 'object') throw new Error('백업 데이터가 없습니다.');
  const decoded = {};
  const includedStores = new Set(Object.keys(payload.stores));
  for (const name of STORES) {
    const rows = payload.stores[name] ?? [];
    if (!Array.isArray(rows)) throw new Error(`${name} 데이터가 배열이 아닙니다.`);
    decoded[name] = await reviveBlobs(rows);
    for (let i = 0; i < decoded[name].length; i++) {
      let row = decoded[name][i];
      const keyField = name === 'settings' ? 'key' : (name === 'attendance' || name === 'dailyStudy' ? 'date' : 'id');
      if (!row || row[keyField] == null) throw new Error(`${name} 항목에 식별자가 없습니다.`);
      if (TIMESTAMPED_STORES.has(name)) {
        const importedAt = row.inputAt || row.createdAt || payload.exportedAt || new Date().toISOString();
        row = { ...row, createdAt: row.createdAt || importedAt, inputAt: importedAt };
        decoded[name][i] = row;
      }
    }
  }

  const db = await openDB();
  const result = { inserted: 0, skipped: 0, mode };
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      // 이전 버전 백업에는 이후 추가된 저장소가 없으므로 replace 복원에서도 보존합니다.
      if (!includedStores.has(name)) continue;
      const store = tx.objectStore(name);
      if (mode === 'replace') {
        store.clear();
        for (const row of decoded[name]) { store.put(row); result.inserted++; }
      } else {
        const keysReq = store.getAllKeys();
        keysReq.onsuccess = () => {
          const existing = new Set(keysReq.result.map(k => String(k)));
          const keyField = name === 'settings' ? 'key' : (name === 'attendance' || name === 'dailyStudy' ? 'date' : 'id');
          for (const row of decoded[name]) {
            const key = String(row[keyField]);
            if (existing.has(key)) { result.skipped++; continue; }
            existing.add(key);
            store.add(row);
            result.inserted++;
          }
        };
        keysReq.onerror = () => { try { tx.abort(); } catch { /* already aborted */ } };
      }
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('복원 트랜잭션에 실패했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('복원이 취소되었습니다. 기존 데이터는 변경되지 않았습니다.'));
  });
  await addAudit('restore', { mode, inserted: result.inserted, skipped: result.skipped });
  return result;
}

export async function createBackupPayload() {
  const db = await openDB();
  // Read every store in one readonly transaction so a backup is a consistent snapshot.
  const snapshot = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readonly');
    const rows = {};
    for (const name of STORES) {
      const request = tx.objectStore(name).getAll();
      request.onsuccess = () => { rows[name] = request.result; };
      request.onerror = () => { try { tx.abort(); } catch { /* transaction already failed */ } };
    }
    tx.oncomplete = () => resolve(rows);
    tx.onerror = () => reject(tx.error || new Error('백업 데이터를 읽지 못했습니다.'));
    tx.onabort = () => reject(tx.error || new Error('백업 읽기가 취소되었습니다.'));
  });
  const stores = {};
  for (const name of STORES) stores[name] = await serializeBlobs(snapshot[name] || []);
  return {
    format: 'exam-life-backup',
    app: '2028 수험생활 통합 관리',
    schemaVersion: DB_VERSION,
    exportedAt: new Date().toISOString(),
    stores
  };
}

async function serializeBlobs(value) {
  if (value instanceof Blob) {
    return { __examLifeBlob: true, mime: value.type || 'application/octet-stream', data: await blobToBase64(value) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(serializeBlobs));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = await serializeBlobs(child);
    return out;
  }
  return value;
}

async function reviveBlobs(value) {
  if (Array.isArray(value)) return Promise.all(value.map(reviveBlobs));
  if (value && typeof value === 'object') {
    if (value.__examLifeBlob === true && typeof value.data === 'string') {
      return base64ToBlob(value.data, value.mime);
    }
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = await reviveBlobs(child);
    return out;
  }
  return value;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error || new Error('이미지 백업 변환에 실패했습니다.'));
    reader.readAsDataURL(blob);
  });
}
function base64ToBlob(data, mime) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime || 'application/octet-stream' });
}
