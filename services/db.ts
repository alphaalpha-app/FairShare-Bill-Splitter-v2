import { Bill, BillManualOverride, BillStays, Tenant, AILog } from '../types';
import { v4 as uuidv4 } from 'uuid';

const DB_NAME = 'FairShareDB';
const DB_VERSION = 2; // Incremented for aiLogs

export class DBService {
  private dbPromise: Promise<IDBDatabase>;

  constructor() {
    this.dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains('tenants')) {
          db.createObjectStore('tenants', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('bills')) {
          db.createObjectStore('bills', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('billStays')) {
          db.createObjectStore('billStays', { keyPath: 'billId' });
        }
        if (!db.objectStoreNames.contains('overrides')) {
          db.createObjectStore('overrides', { keyPath: 'billId' });
        }
        if (!db.objectStoreNames.contains('aiLogs')) {
          db.createObjectStore('aiLogs', { keyPath: 'id' });
        }
      };
    });
  }

  private async getStore(storeName: string, mode: IDBTransactionMode) {
    const db = await this.dbPromise;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  // Tenants
  async getTenants(): Promise<Tenant[]> {
    const store = await this.getStore('tenants', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveTenant(tenant: Tenant): Promise<void> {
    const store = await this.getStore('tenants', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(tenant);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async deleteTenant(id: string): Promise<void> {
    const store = await this.getStore('tenants', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Bills
  async getBills(): Promise<Bill[]> {
    const store = await this.getStore('bills', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a: Bill, b: Bill) => b.createdAt - a.createdAt));
      req.onerror = () => reject(req.error);
    });
  }

  async getBill(id: string): Promise<Bill | undefined> {
    const store = await this.getStore('bills', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveBill(bill: Bill): Promise<void> {
    const store = await this.getStore('bills', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(bill);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Stays (Deprecated mostly, but keeping for compatibility if needed, 
  // though app logic will now prefer Tenant.defaultStayDates)
  async getBillStays(billId: string): Promise<BillStays | undefined> {
    const store = await this.getStore('billStays', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(billId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveBillStays(stays: BillStays): Promise<void> {
    const store = await this.getStore('billStays', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(stays);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // Overrides
  async getOverrides(billId: string): Promise<BillManualOverride | undefined> {
    const store = await this.getStore('overrides', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(billId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async saveOverrides(ov: BillManualOverride): Promise<void> {
    const store = await this.getStore('overrides', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(ov);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  // AI Logs
  async saveAILog(log: AILog): Promise<void> {
    const store = await this.getStore('aiLogs', 'readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(log);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async getAILogs(): Promise<AILog[]> {
    const store = await this.getStore('aiLogs', 'readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a: AILog, b: AILog) => b.timestamp - a.timestamp));
      req.onerror = () => reject(req.error);
    });
  }

  // Export/Import
  async exportData(): Promise<string> {
    const tenants = await this.getTenants();
    const bills = await this.getBills();
    const stays: BillStays[] = [];
    const overrides: BillManualOverride[] = [];
    
    // We export BillStays just in case, but logic is moving to Tenants
    for (const b of bills) {
      const s = await this.getBillStays(b.id);
      if (s) stays.push(s);
      const o = await this.getOverrides(b.id);
      if (o) overrides.push(o);
    }
    
    const aiLogs = await this.getAILogs();

    return JSON.stringify({ tenants, bills, stays, overrides, aiLogs, version: 2 });
  }

  async importData(json: string): Promise<void> {
    const data = JSON.parse(json);
    if (!data.tenants || !data.bills) throw new Error("Invalid backup file");

    const tStore = await this.getStore('tenants', 'readwrite');
    for (const t of data.tenants) tStore.put(t);

    const bStore = await this.getStore('bills', 'readwrite');
    for (const b of data.bills) bStore.put(b);

    if (data.stays) {
      const sStore = await this.getStore('billStays', 'readwrite');
      for (const s of data.stays) sStore.put(s);
    }

    if (data.overrides) {
      const oStore = await this.getStore('overrides', 'readwrite');
      for (const o of data.overrides) oStore.put(o);
    }

    if (data.aiLogs) {
      const aiStore = await this.getStore('aiLogs', 'readwrite');
      for (const log of data.aiLogs) aiStore.put(log);
    }
  }
}

export const db = new DBService();