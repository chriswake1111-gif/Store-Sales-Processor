import * as XLSX from 'xlsx';
import { ProcessedData, Stage1Status } from '../types';

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
          // If first attempt failed and it was binary strategy, try array fallback logic if needed
          // But usually we just reject here or implementing detailed fallback flow
          reject(err);
        }
      };
      reader.onerror = reject;
      
      if (type === 'binary') reader.readAsBinaryString(file);
      else reader.readAsArrayBuffer(file);
    };

    // Prioritize BinaryString for .xls (legacy support), ArrayBuffer for .xlsx
    if (isXLS) {
      try {
        readFile('binary');
      } catch {
        readFile('array');
      }
    } else {
      readFile('array');
    }
  });
};

const safeVal = (val: any) => (val === undefined || val === null) ? "" : val;
const sanitizeSheetName = (name: string): string => name.replace(/[\[\]\:\*\?\/\\\\]/g, '_').substring(0, 31) || "Unknown";

export const exportToExcel = async (processedData: ProcessedData, defaultFilename: string, selectedPersons: Set<string>) => {
  const workbook = XLSX.utils.book_new();
  const repurchaseData: any[] = [];
  const sortedPersons = Object.keys(processedData).sort();

  sortedPersons.forEach((person) => {
    if (!selectedPersons.has(person)) return;

    const data = processedData[person];
    const wsData: any[][] = [];
    const styles: {r: number, c?: number, type: 'section' | 'header'}[] = [];

    // STAGE 1
    wsData.push(["【第一階段：點數表】"]);
    styles.push({r: wsData.length - 1, type: 'section'});
    wsData.push(["分類", "日期", "客戶編號", "品項編號", "品名", "數量", "計算點數"]);
    styles.push({r: wsData.length - 1, type: 'header'});
    
    data.stage1.forEach(row => {
      if (row.status === Stage1Status.DELETE) return;
      if (row.status === Stage1Status.REPURCHASE) {
        repurchaseData.push({
           '銷售人員': person,
           '分類': safeVal(row.category),
           '日期': safeVal(row.date),
           '客戶編號': safeVal(row.customerID),
           '品項編號': safeVal(row.itemID),
           '品名': safeVal(row.itemName),
           '數量': safeVal(row.quantity),
           '計算點數': safeVal(row.calculatedPoints)
        });
      } else {
        wsData.push([
          safeVal(row.category), safeVal(row.date), safeVal(row.customerID),
          safeVal(row.itemID), safeVal(row.itemName), safeVal(row.quantity),
          safeVal(row.calculatedPoints)
        ]);
      }
    });

    wsData.push([], []);

    // STAGE 2
    wsData.push(["【第二階段：現金獎勵表】"]);
    styles.push({r: wsData.length - 1, type: 'section'});
    wsData.push(["類別", "日期", "客戶編號", "品項編號", "品名", "數量", "備註", "獎勵"]);
    styles.push({r: wsData.length - 1, type: 'header'});
    
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

    // STAGE 3
    wsData.push(["【第三階段：美妝金額】"]);
    styles.push({r: wsData.length - 1, type: 'section'});
    wsData.push(["品牌分類", "金額"]);
    styles.push({r: wsData.length - 1, type: 'header'});
    
    data.stage3.rows.forEach(row => wsData.push([safeVal(row.categoryName), safeVal(row.subTotal)]));
    wsData.push(["總金額", safeVal(data.stage3.total)]);

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Apply Styles (Note: Only works in Pro versions of SheetJS or specific environments, but safe to keep)
    ws['!cols'] = [{ wch: 15 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 20 }, { wch: 15 }];
    
    styles.forEach(({r, type}) => {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell && type === 'section') {
        cell.s = { font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: "4F81BD" } } };
      }
      if (type === 'header') {
        const row = wsData[r];
        row.forEach((_, c) => {
          const hCell = ws[XLSX.utils.encode_cell({ r, c })];
          if (hCell) hCell.s = { font: { bold: true }, fill: { fgColor: { rgb: "DCE6F1" } } };
        });
      }
    });

    let sheetName = sanitizeSheetName(person);
    let count = 1;
    const baseName = sheetName;
    while (workbook.SheetNames.includes(sheetName)) {
      sheetName = `${baseName.substring(0, 28)}(${count++})`;
    }
    XLSX.utils.book_append_sheet(workbook, ws, sheetName);
  });

  if (repurchaseData.length > 0) {
    const wsRep = XLSX.utils.json_to_sheet(repurchaseData);
    wsRep['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(workbook, wsRep, "回購總表");
  }

  // Save File
  if ('showSaveFilePicker' in window) {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `${defaultFilename}.xlsx`,
        types: [{ description: 'Excel File', accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] } }],
      });
      const writable = await handle.createWritable();
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await writable.write(new Blob([wbout], { type: 'application/octet-stream' }));
      await writable.close();
      return;
    } catch (err: any) {
      if (err.name !== 'AbortError') console.warn("FS API failed", err);
      else return; 
    }
  }

  XLSX.writeFile(workbook, `${defaultFilename}.xlsx`);
};