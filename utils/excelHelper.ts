import * as XLSX from 'xlsx';
import { ProcessedData, Stage1Status, Stage1Row } from '../types';

export const readExcelFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const isXLS = file.name.toLowerCase().endsWith('.xls');
    const readFile = (type: 'binary' | 'array') => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const workbook = XLSX.read(e.target?.result, { 
            type, 
            cellFormula: false, 
            cellHTML: false 
          });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          resolve(XLSX.utils.sheet_to_json(sheet));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      
      if (type === 'binary') reader.readAsBinaryString(file);
      else reader.readAsArrayBuffer(file);
    };

    if (isXLS) {
      try { readFile('binary'); } catch { readFile('array'); }
    } else {
      readFile('array');
    }
  });
};

const safeVal = (val: any) => (val === undefined || val === null) ? "" : val;
const sanitizeSheetName = (name: string): string => name.replace(/[\[\]\:\*\?\/\\\\]/g, '_').substring(0, 31) || "Unknown";

export const exportToExcel = async (processedData: ProcessedData, defaultFilename: string, selectedPersons: Set<string>) => {
  // 1. IMMEDIATE FILE SYSTEM API TRIGGER (CRITICAL FOR USER ACTIVATION)
  // This must be the very first await in the function to prevent the browser from blocking the dialog.
  let fileHandle: any = null;
  const filename = defaultFilename.trim().replace(/\.xlsx$/i, '') + '.xlsx';
  
  if ('showSaveFilePicker' in window) {
    try {
      fileHandle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [{
          description: 'Excel File',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
        }],
      });
    } catch (err: any) {
      if (err.name === 'AbortError') return; // Stop if user cancelled
      console.warn("FS API failed, falling back to download", err);
    }
  }

  // 2. BUILD WORKBOOK
  const workbook = XLSX.utils.book_new();
  const repurchaseMap: Record<string, { rows: Stage1Row[], totalPoints: number }> = {};
  const sortedPersons = Object.keys(processedData).sort();

  sortedPersons.forEach((person) => {
    if (!selectedPersons.has(person)) return;

    const data = processedData[person];
    const wsData: any[][] = [];

    // --- STAGE 1 ---
    const s1Total = data.stage1.reduce((sum, row) => {
      if (row.status === Stage1Status.DEVELOP || row.status === Stage1Status.HALF_YEAR) {
        return sum + row.calculatedPoints;
      }
      return sum;
    }, 0);

    wsData.push([`【第一階段：點數表】 ${s1Total}點`]);
    wsData.push(["分類", "日期", "客戶編號", "品項編號", "品名", "數量", "計算點數"]);
    
    data.stage1.forEach(row => {
      if (row.status === Stage1Status.DELETE) return;
      
      if (row.status === Stage1Status.REPURCHASE) {
        if (!repurchaseMap[person]) {
          repurchaseMap[person] = { rows: [], totalPoints: 0 };
        }
        repurchaseMap[person].rows.push(row);
        repurchaseMap[person].totalPoints += row.calculatedPoints;
      } else {
        wsData.push([
          safeVal(row.category), safeVal(row.date), safeVal(row.customerID),
          safeVal(row.itemID), safeVal(row.itemName), safeVal(row.quantity),
          safeVal(row.calculatedPoints)
        ]);
      }
    });

    wsData.push([], []);

    // --- STAGE 2 ---
    const s2Totals = data.stage2.reduce((acc, row) => {
      if (row.isDeleted) return acc;
      if (row.format === '禮券') {
        acc.vouchers += row.quantity;
      } else {
        const amount = row.customReward !== undefined ? row.customReward : (row.quantity * row.reward);
        acc.cash += amount;
      }
      return acc;
    }, { cash: 0, vouchers: 0 });

    wsData.push([`【第二階段：現金獎勵表】 現金$${s2Totals.cash.toLocaleString()} 禮券${s2Totals.vouchers}張`]);
    wsData.push(["類別", "日期", "客戶編號", "品項編號", "品名", "數量", "備註", "獎勵"]);
    
    data.stage2.forEach(row => {
      if (row.isDeleted) return;
      let rewardDisplay = "";
      if (row.format === '禮券') {
        rewardDisplay = `${row.quantity}張${safeVal(row.rewardLabel)}`;
      } else {
        const amount = row.customReward !== undefined ? row.customReward : (row.quantity * row.reward);
        rewardDisplay = `${amount}元`;
      }
      wsData.push([
        safeVal(row.category), safeVal(row.displayDate), safeVal(row.customerID),
        safeVal(row.itemID), safeVal(row.itemName), safeVal(row.quantity),
        safeVal(row.note), safeVal(rewardDisplay)
      ]);
    });

    wsData.push([], []);

    // --- STAGE 3 ---
    wsData.push(["【第三階段：美妝金額】"]);
    wsData.push(["品牌分類", "金額"]);
    
    data.stage3.rows.forEach(row => wsData.push([safeVal(row.categoryName), safeVal(row.subTotal)]));
    wsData.push(["總金額", safeVal(data.stage3.total)]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Set Column Widths
    ws['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 20 }, { wch: 15 }];

    let sheetName = sanitizeSheetName(person);
    let count = 1;
    const baseName = sheetName;
    while (workbook.SheetNames.includes(sheetName)) {
      sheetName = `${baseName.substring(0, 28)}(${count++})`;
    }
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  });

  // --- REPURCHASE SUMMARY SHEET ---
  const repPersons = Object.keys(repurchaseMap).sort();
  if (repPersons.length > 0) {
    const repData: any[][] = [];
    repPersons.forEach(person => {
        const group = repurchaseMap[person];
        repData.push([`${person}    回購：${group.totalPoints}`]);
        repData.push(["分類", "日期", "客戶編號", "品項編號", "品名", "數量", "計算點數"]);
        group.rows.forEach(row => {
            repData.push([
                safeVal(row.category), safeVal(row.date), safeVal(row.customerID),
                safeVal(row.itemID), safeVal(row.itemName), safeVal(row.quantity),
                safeVal(row.calculatedPoints)
            ]);
        });
        repData.push([]); 
    });

    const wsRep = XLSX.utils.aoa_to_sheet(repData);
    wsRep['!cols'] = [{ wch: 25 }, { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, wsRep, "回購總表");
  }

  // 3. WRITE TO FILE
  if (fileHandle) {
    const writable = await fileHandle.createWritable();
    const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    await writable.write(new Blob([wbout], { type: 'application/octet-stream' }));
    await writable.close();
  } else {
    // Fallback logic
    XLSX.writeFile(workbook, filename);
  }
};