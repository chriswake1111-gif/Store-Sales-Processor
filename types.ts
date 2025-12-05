
export interface RawRow {
  [key: string]: any;
}

// Config Types
export interface ExclusionItem {
  itemID: string; // 品項編號
}

export interface RewardRule {
  itemID: string; // 品項編號
  note: string; // 備註
  category: string; // 類別
  reward: number; // 獎勵金額 (Unit Reward)
  rewardLabel: string; // 原始獎勵文字 (New for Voucher label)
  format: string; // 形式 (現金/禮券)
}

// Stage Data Types
export enum Stage1Status {
  DEVELOP = '開發',
  HALF_YEAR = '隔半年',
  REPURCHASE = '回購',
  DELETE = '刪除', // Added Delete Status
}

export interface Stage1Row {
  id: string; // Unique ID for React keys
  salesPerson: string; // 銷售人員
  date: string; // 顯示日期 (單號5-6)
  customerID: string; // 客戶編號
  customerName: string; // 客戶名稱 (Kept in data for reference, hidden in UI)
  itemID: string; // 品項編號 (New)
  itemName: string; // 品項名稱
  quantity: number; // 數量
  originalPoints: number; // 原始點數
  calculatedPoints: number; // 計算後點數
  category: string; // 新分類
  status: Stage1Status; // 狀態
  raw: RawRow; // Keep reference to raw data if needed
}

export interface Stage2Row {
  id: string; // Unique ID
  salesPerson: string;
  displayDate: string; // 顯示日期
  sortDate: any; // 排序日期 (原始銷售日期)
  customerID: string;
  customerName: string;
  itemID: string; // 品項編號 (New)
  itemName: string; // 品項名稱
  quantity: number; // 數量 (New)
  category: string; // 來自規則表
  note: string; // 來自規則表
  reward: number; // 來自規則表 (Unit Reward)
  rewardLabel: string; // 來自規則表 (New)
  customReward?: number; // 使用者手動編輯的總金額 (New)
  format: string; // 來自規則表 (New)
  isDeleted: boolean; // Soft delete flag (New)
}

export interface Stage3Row {
  categoryName: string; // 理膚, 適樂膚...
  subTotal: number;
}

export interface Stage3Summary {
  salesPerson: string;
  rows: Stage3Row[];
  total: number;
}

// Grouped Data Structure
export interface ProcessedData {
  [salesPerson: string]: {
    stage1: Stage1Row[];
    stage2: Stage2Row[];
    stage3: Stage3Summary;
  };
}
