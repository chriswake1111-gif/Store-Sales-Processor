import { RawRow, ExclusionItem, RewardRule, Stage1Row, Stage2Row, Stage3Summary, Stage1Status, Stage3Row } from '../types';
import { COL_HEADERS, CAT_MAPPING, COSMETIC_CODES, STAGE1_SORT_ORDER, COSMETIC_DISPLAY_ORDER } from '../constants';
import { v4 as uuidv4 } from 'uuid';

// Helper: Safely get values
const getVal = (row: RawRow, key: string): any => row[key];
const getStr = (row: RawRow, key: string): string => String(row[key] || '').trim();
const getNum = (row: RawRow, key: string): number => Number(row[key]) || 0;

// --- STAGE 1: Points Table ---
export const processStage1 = (rawData: RawRow[], exclusionList: ExclusionItem[]): Stage1Row[] => {
  const excludedItemIDs = new Set(exclusionList.map(i => String(i.itemID).trim()));
  const processed: Stage1Row[] = [];

  for (const row of rawData) {
    const cid = getVal(row, COL_HEADERS.CUSTOMER_ID);
    if (!cid || cid === 'undefined') continue;

    // Filter Logic
    if (getNum(row, COL_HEADERS.DEBT) > 0) continue;
    
    const points = getNum(row, COL_HEADERS.POINTS) || getNum(row, '點數');
    if (points === 0) continue;

    if (getNum(row, COL_HEADERS.UNIT_PRICE) === 0) continue;

    const cat1 = getStr(row, COL_HEADERS.CAT_1);
    const unit = getStr(row, COL_HEADERS.UNIT);
    if (cat1 === '05-2' && (unit === '罐' || unit === '瓶')) continue;

    const itemID = getStr(row, COL_HEADERS.ITEM_ID);
    if (excludedItemIDs.has(itemID)) continue;

    // Transformation
    const rawPoints = points;
    const qty = getNum(row, COL_HEADERS.QUANTITY);
    const category = CAT_MAPPING[cat1] || '其他';
    
    // Points Calc
    const isMilk = category === '成人奶粉' || category === '成人奶水';
    const calculatedPoints = isMilk ? Math.floor(rawPoints / (qty || 1)) : rawPoints;

    // Date parsing
    const ticketNo = getStr(row, COL_HEADERS.TICKET_NO);
    const dateStr = ticketNo.length >= 7 ? ticketNo.substring(5, 7) : '??';
    
    // Fallback Item Name
    const itemName = getVal(row, COL_HEADERS.ITEM_NAME) || getVal(row, '品名') || '';

    processed.push({
      id: uuidv4(),
      salesPerson: String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown'),
      date: dateStr,
      customerID: cid,
      customerName: getVal(row, COL_HEADERS.CUSTOMER_NAME),
      itemID,
      itemName,
      quantity: qty,
      originalPoints: rawPoints,
      calculatedPoints,
      category,
      status: Stage1Status.DEVELOP,
      raw: row
    });
  }

  // Sorting
  return processed.sort((a, b) => {
    const orderA = STAGE1_SORT_ORDER[a.category] ?? 99;
    const orderB = STAGE1_SORT_ORDER[b.category] ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.date.localeCompare(b.date);
  });
};

export const recalculateStage1Points = (row: Stage1Row): number => {
  if (row.status === Stage1Status.DELETE) return 0;
  let base = row.originalPoints;
  if (row.category === '成人奶粉' || row.category === '成人奶水') {
     base = Math.floor(row.originalPoints / (row.quantity || 1));
  }
  return row.status === Stage1Status.REPURCHASE ? Math.floor(base / 2) : base;
};

// --- STAGE 2: Cash Rewards ---
export const processStage2 = (rawData: RawRow[], rewardRules: RewardRule[]): Stage2Row[] => {
  const ruleMap = new Map(rewardRules.map(r => [String(r.itemID).trim(), r]));
  const processed: Stage2Row[] = [];

  for (const row of rawData) {
    const itemID = getStr(row, COL_HEADERS.ITEM_ID);
    const rule = ruleMap.get(itemID);
    
    if (!rule) continue;

    const cid = getVal(row, COL_HEADERS.CUSTOMER_ID);
    if (!cid || cid === 'undefined') continue;
    if (getNum(row, COL_HEADERS.UNIT_PRICE) === 0) continue;
    if (getNum(row, COL_HEADERS.DEBT) > 0) continue;

    const cat1 = getStr(row, COL_HEADERS.CAT_1);
    const unit = getStr(row, COL_HEADERS.UNIT);
    if (cat1 === '05-2' && (unit === '罐' || unit === '瓶')) continue;

    const ticketNo = getStr(row, COL_HEADERS.TICKET_NO);
    const displayDate = ticketNo.length >= 7 ? ticketNo.substring(5, 7) : '??';

    processed.push({
      id: uuidv4(),
      salesPerson: String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown'),
      displayDate,
      sortDate: getVal(row, COL_HEADERS.SALES_DATE),
      customerID: cid,
      customerName: getVal(row, COL_HEADERS.CUSTOMER_NAME),
      itemID,
      itemName: getVal(row, COL_HEADERS.ITEM_NAME) || getVal(row, '品名') || '',
      quantity: getNum(row, COL_HEADERS.QUANTITY),
      category: rule.category,
      note: rule.note,
      reward: rule.reward,
      rewardLabel: rule.rewardLabel,
      format: rule.format,
      isDeleted: false
    });
  }

  return processed.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.displayDate.localeCompare(b.displayDate);
  });
};

// --- STAGE 3: Cosmetics ---
export const processStage3 = (rawData: RawRow[]): Stage3Summary[] => {
  const byPerson: Record<string, Record<string, number>> = {};

  for (const row of rawData) {
    const cat2 = getStr(row, COL_HEADERS.CAT_2);
    if (!COSMETIC_CODES[cat2]) continue;

    const person = String(getVal(row, COL_HEADERS.SALES_PERSON) || 'Unknown');
    const brandName = COSMETIC_CODES[cat2];
    const subTotal = getNum(row, COL_HEADERS.SUBTOTAL);

    if (!byPerson[person]) byPerson[person] = {};
    byPerson[person][brandName] = (byPerson[person][brandName] || 0) + subTotal;
  }

  return Object.keys(byPerson).map(person => {
    const brandTotals = byPerson[person];
    const rows = COSMETIC_DISPLAY_ORDER.map(brand => ({
      categoryName: brand,
      subTotal: brandTotals[brand] || 0
    }));
    return {
      salesPerson: person,
      rows,
      total: rows.reduce((acc, curr) => acc + curr.subTotal, 0)
    };
  });
};

export const generateEmptyStage3Rows = (): Stage3Row[] => {
  return COSMETIC_DISPLAY_ORDER.map(brand => ({ categoryName: brand, subTotal: 0 }));
};