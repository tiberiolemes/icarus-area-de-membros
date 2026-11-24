type Receipt = { key: CryptoKey; expiresAt: number };
const receiptLifetime = 2 * 60 * 60 * 1000;
const encoder = new TextEncoder();
const receiptUnavailable = "Permita o armazenamento neste navegador ou entre na sua conta para continuar o pagamento.";

async function receipts<T>(operation: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const open = indexedDB.open("icarus-checkout", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("receipts").createIndex("expiresAt", "expiresAt");
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("receipts", "readwrite");
      const store = tx.objectStore("receipts");
      const request = operation(store);
      const expired = store.index("expiresAt").openKeyCursor(IDBKeyRange.upperBound(Date.now()));
      expired.onsuccess = () => {
        const cursor = expired.result;
        if (!cursor) return;
        store.delete(cursor.primaryKey);
        cursor.continue();
      };
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function prepareReceipt(attemptId: string): Promise<Receipt> {
  try {
    const key = await crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const receipt = { key, expiresAt: Date.now() + receiptLifetime };
    // Confirma a gravação da chave antes de reservar o pedido no servidor.
    await receipts((store) => store.put(receipt, attemptId));
    return receipt;
  } catch {
    throw new Error(receiptUnavailable);
  }
}

export async function saveReceipt(orderId: string, attemptId: string, receipt: Receipt) {
  try {
    await receipts((store) => {
      store.delete(attemptId);
      return store.put(receipt, orderId);
    });
  } catch {
    throw new Error(receiptUnavailable);
  }
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

// O navegador persiste a chave não exportável. O token só existe durante a chamada.
async function receiptToken(key: CryptoKey) {
  return hex(await crypto.subtle.sign("HMAC", key, encoder.encode("icarus:order-status:v1")));
}

export async function receiptHash(receipt: Receipt) {
  if (receipt.expiresAt <= Date.now())
    throw new Error("Esta tentativa expirou. Abra o checkout novamente para começar outro pedido.");
  return hex(await crypto.subtle.digest("SHA-256", encoder.encode(await receiptToken(receipt.key))));
}

export async function loadReceipt(orderId: string) {
  try {
    const receipt: Receipt | undefined = await receipts((store) => store.get(orderId));
    if (receipt && receipt.expiresAt > Date.now()) return await receiptToken(receipt.key);
  } catch {
    // Navegadores com armazenamento indisponível ainda podem consultar pelo login.
  }
}
