import { BillType } from './types';

export const COLORS = [
  '#ef4444', // Red
  '#f97316', // Orange
  '#f59e0b', // Amber
  '#84cc16', // Lime
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#d946ef', // Fuchsia
  '#f43f5e', // Rose
];

export const BILL_TYPE_LABELS: Record<BillType, string> = {
  [BillType.ELECTRICITY]: 'Electricity',
  [BillType.GAS]: 'Gas',
  [BillType.WATER]: 'Water',
};

export const BILL_TYPE_ICONS: Record<BillType, string> = {
  [BillType.ELECTRICITY]: 'Zap',
  [BillType.GAS]: 'Flame',
  [BillType.WATER]: 'Droplet',
};
