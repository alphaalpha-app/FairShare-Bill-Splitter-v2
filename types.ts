
export enum BillType {
  ELECTRICITY = 'ELECTRICITY',
  GAS = 'GAS',
  WATER = 'WATER'
}

export type AIModelProvider = 'gemini' | 'chatgpt' | 'grok' | 'deepseek';

export interface UserSession {
  token: string;
  username: string;
  expiresAt: number;
}

export interface Period {
  id: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  usageCost: number;
}

export interface Tenant {
  id: string;
  name: string;
  color: string;
  defaultStayDates: string[]; // List of YYYY-MM-DD (Global source of truth)
}

export interface Bill {
  id: string;
  type: BillType;
  name: string;
  periods: Period[];
  supplyCost: number;
  sewerageCost: number; // Water only
  includedTenantIds: string[];
  createdAt: number;
}

// Deprecated: We now use Tenant.defaultStayDates directly
export interface BillStays {
  billId: string;
  tenantStays: Record<string, string[]>; 
}

export interface BillManualOverride {
  billId: string;
  // tenantId -> override object
  overrides: Record<string, {
    total?: number;
    usage?: number;
    supply?: number;
    sewerage?: number;
  }>;
}

export interface CalculationResult {
  tenantId: string;
  total: number;
  supplyShare: number;
  sewerageShare: number;
  periodBreakdown: {
    periodId: string;
    stayDays: number;
    usageCost: number;
  }[];
  totalUsageCost: number;
  isOverridden?: boolean;
}

export interface AILog {
  id: string;
  timestamp: number;
  billType: string;
  status: 'SUCCESS' | 'FAILED';
  details: string;
  model?: string; // Track which model was used
}
