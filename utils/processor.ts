

import { RawRow, ExclusionItem, RewardRule, Stage1Row, Stage2Row, Stage3Summary, Stage1Status, Stage3Row } from '../types';
import { COL_HEADERS, CAT_MAPPING, COSMETIC_CODES, STAGE1_SORT_ORDER, COSMETIC_DISPLAY_ORDER } from '../constants';
import { v4 as uuidv4 } from 'uuid';

// Helper: Safely get string value
const getVal = (row: RawRow, key: string): any => row[key];
const getNum = (row: RawRow, key: string): number => Number(row[key]) || 0;

// --- STAGE 1: Points Table ---
export const processStage1 = (rawData: RawRow[], exclusionList: ExclusionItem[]): Stage1Row[] => {
  const excludedItemIDs = new Set(exclusionList.map(i => String(i.itemID).trim()));

  const processed = rawData.filter(row => {
    // 1. Filter Logic
    const cid = getVal(row, COL_HEADERS.CUSTOMER_ID);
    if (!cid || cid === 'undefined') return false;

    if (getNum(row, COL_HEADERS.DEBT) > 0) return false;
    
    const points = getNum(row, COL_HEADERS.POINTS) || getNum(row, '點數');
    if (points === 0) return false;

    if (getNum(row, COL_HEADERS.UNIT_PRICE) === 0) return false;

    const cat1 = String(getVal(row, COL_HEADERS.CAT_1)).trim();
    const unit = String(getVal(row, COL_HEADERS.UNIT)).trim();
    if (cat1 === '05-2' && (unit === '罐' || unit === '瓶')) return false;

    const itemID = String(getVal(row, COL_HEADERS.ITEM_ID)).trim();
    if (excludedItemIDs.has(itemID)) return false;

    return true;
  }).map(row => {
    // 2. Transformation
    const cat1 = String(getVal(row, COL_HEADERS.CAT_1)).trim();
    const rawPoints = getNum(row, COL_HEADERS.POINTS) || getNum(row, '點數');
    const qty = getNum(row, COL_HEADERS.QUANTITY);
    
    // Category mapping
    let category = CAT_MAPPING[cat1] || '其他';

    // Points Calc
    let calculatedPoints = rawPoints;
    if (category === '成人奶粉' || category === '成人奶水') {
       calculatedPoints = Math.floor(rawPoints / (qty || 1));
    }

    // Date parsing (Ticket No index 5-6)
    const ticketNo = String(getVal(row, COL_HEADERS.TICKET_NO) || '');
    const dateStr = ticketNo.length >= 7 ? ticketNo.substring(5, 7) : '??';
    
    // Item Name Fallback
    const itemName = getVal(row, COL_HEADERS.ITEM_NAME) || getVal(row, '品名') || '';

    return {
      id: uuidv4(),
      salesPerson: String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown'),
      date: dateStr,
      customerID: getVal(row, COL_HEADERS.CUSTOMER_ID),
      customerName: getVal(row, COL_HEADERS.CUSTOMER_NAME),
      itemID: String(getVal(row, COL_HEADERS.ITEM_ID)),
      itemName: itemName,
      quantity: qty,
      originalPoints: rawPoints,
      calculatedPoints: calculatedPoints,
      category: category,
      status: Stage1Status.DEVELOP,
      raw: row
    };
  });

  // 3. Sort: Custom Category Order -> Date
  return processed.sort((a, b) => {
    const orderA = STAGE1_SORT_ORDER[a.category] ?? 99;
    const orderB = STAGE1_SORT_ORDER[b.category] ?? 99;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    // Secondary sort by date (ticket string snippet, effectively numeric string)
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    return 0;
  });
};

export const recalculateStage1Points = (row: Stage1Row): number => {
  if (row.status === Stage1Status.DELETE) {
    return 0;
  }

  if (row.status === Stage1Status.REPURCHASE) {
    let basePoints = row.originalPoints;
    if (row.category === '成人奶粉' || row.category === '成人奶水') {
       basePoints = Math.floor(row.originalPoints / (row.quantity || 1));
    }
    return Math.floor(basePoints / 2);
  }
  
  // Default / Half Year / Develop
  let basePoints = row.originalPoints;
  if (row.category === '成人奶粉' || row.category === '成人奶水') {
     basePoints = Math.floor(row.originalPoints / (row.quantity || 1));
  }
  return basePoints;
};


// --- STAGE 2: Cash Rewards ---
export const processStage2 = (rawData: RawRow[], rewardRules: RewardRule[]): Stage2Row[] => {
  // Map Rules for fast lookup
  const ruleMap = new Map<string, RewardRule>();
  rewardRules.forEach(r => ruleMap.set(String(r.itemID).trim(), r));

  const validRows = rawData.filter(row => {
    // 1. Rule Matching (Preliminary)
    const itemID = String(getVal(row, COL_HEADERS.ITEM_ID)).trim();
    if (!ruleMap.has(itemID)) return false;

    // 2. Auto Exclusion
    const cid = getVal(row, COL_HEADERS.CUSTOMER_ID);
    if (!cid || cid === 'undefined') return false;

    if (getNum(row, COL_HEADERS.UNIT_PRICE) === 0) return false;
    if (getNum(row, COL_HEADERS.DEBT) > 0) return false;

    const cat1 = String(getVal(row, COL_HEADERS.CAT_1)).trim();
    const unit = String(getVal(row, COL_HEADERS.UNIT)).trim();
    if (cat1 === '05-2' && (unit === '罐' || unit === '瓶')) return false;

    return true;
  });

  const processed = validRows.map(row => {
    const itemID = String(getVal(row, COL_HEADERS.ITEM_ID)).trim();
    const rule = ruleMap.get(itemID)!;
    
    const ticketNo = String(getVal(row, COL_HEADERS.TICKET_NO) || '');
    const displayDate = ticketNo.length >= 7 ? ticketNo.substring(5, 7) : '??';

    // Item Name Fallback
    const itemName = getVal(row, COL_HEADERS.ITEM_NAME) || getVal(row, '品名') || '';

    // Quantity
    const qty = getNum(row, COL_HEADERS.QUANTITY);

    return {
      id: uuidv4(),
      salesPerson: String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown'),
      displayDate,
      sortDate: getVal(row, COL_HEADERS.SALES_DATE), // Raw date for sorting
      customerID: getVal(row, COL_HEADERS.CUSTOMER_ID),
      customerName: getVal(row, COL_HEADERS.CUSTOMER_NAME),
      itemID: itemID,
      itemName: itemName,
      quantity: qty,
      category: rule.category,
      note: rule.note,
      reward: rule.reward, // Unit Reward
      rewardLabel: rule.rewardLabel, // Label string
      format: rule.format, // Cash or Voucher
      isDeleted: false
    };
  });

  // Sort: Category ASC, then Date ASC
  return processed.sort((a, b) => {
    if (a.category < b.category) return -1;
    if (a.category > b.category) return 1;
    // Same category, sort by date
    if (a.displayDate < b.displayDate) return -1;
    if (a.displayDate > b.displayDate) return 1;
    return 0;
  });
};

// --- STAGE 3: Cosmetics ---
export const processStage3 = (rawData: RawRow[]): Stage3Summary[] => {
  // Filter relevant rows (Codes are updated in constants)
  const relevantRows = rawData.filter(row => {
    const cat2 = String(getVal(row, COL_HEADERS.CAT_2)).trim();
    return COSMETIC_CODES.hasOwnProperty(cat2);
  });

  // Group by Sales Person
  const byPerson: Record<string, Record<string, number>> = {};

  relevantRows.forEach(row => {
    const person = String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown');
    const cat2 = String(getVal(row, COL_HEADERS.CAT_2)).trim();
    const brandName = COSMETIC_CODES[cat2];
    const subTotal = getNum(row, COL_HEADERS.SUBTOTAL);

    if (!byPerson[person]) byPerson[person] = {};
    if (!byPerson[person][brandName]) byPerson[person][brandName] = 0;
    
    byPerson[person][brandName] += subTotal;
  });

  // Convert to array format with Fixed Order
  return Object.keys(byPerson).map(person => {
    const brandTotals = byPerson[person];
    
    // Map strictly using COSMETIC_DISPLAY_ORDER
    const rows: Stage3Row[] = COSMETIC_DISPLAY_ORDER.map(brand => ({
      categoryName: brand,
      subTotal: brandTotals[brand] || 0
    }));
    
    const total = rows.reduce((acc, curr) => acc + curr.subTotal, 0);

    return {
      salesPerson: person,
      rows,
      total
    };
  });
};

// Helper to generate a blank stage 3 template (all zeros) for persons with no cosmetic sales
export const generateEmptyStage3Rows = (): Stage3Row[] => {
  return COSMETIC_DISPLAY_ORDER.map(brand => ({
    categoryName: brand,
    subTotal: 0
  }));
};
