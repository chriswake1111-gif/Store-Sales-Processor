
import * as XLSX from 'xlsx';
import { ProcessedData, Stage1Status, Stage1Row } from '../types';

// Read file to JSON
export const readExcelFile = (file: File): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    const isXLS = file.name.toLowerCase().endsWith('.xls');

    // Strategy 1: Binary String (Best for legacy .xls and fixing 0x27d errors)
    const readBinary = (): Promise<any> => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { 
            type: 'binary',
            cellFormula: false,
            cellHTML: false 
          });
          res(workbook);
        } catch (err) { rej(err); }
      };
      reader.onerror = rej;
      reader.readAsBinaryString(file);
    });

    // Strategy 2: Array Buffer (Standard for modern .xlsx)
    const readArray = (): Promise<any> => new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const workbook = XLSX.read(data, { 
            type: 'array',
            cellFormula: false,
            cellHTML: false
          });
          res(workbook);
        } catch (err) { rej(err); }
      };
      reader.onerror = rej;
      reader.readAsArrayBuffer(file);
    });

    // Determine order based on extension
    const primaryStrategy = isXLS ? readBinary : readArray;
    const fallbackStrategy = isXLS ? readArray : readBinary;

    const processWorkbook = (wb: any) => {
      const sheetName = wb.SheetNames[0]; // Assume first sheet
      const sheet = wb.Sheets[sheetName];
      // Convert to JSON with header row
      const jsonData = XLSX.utils.sheet_to_json(sheet);
      resolve(jsonData);
    };

    // Execute
    primaryStrategy()
      .then(processWorkbook)
      .catch((primaryError) => {
        console.warn(`Primary read strategy (${isXLS ? 'Binary' : 'Array'}) failed, attempting fallback...`, primaryError);
        
        fallbackStrategy()
          .then(processWorkbook)
          .catch((fallbackError) => {
            console.error("All read strategies failed", fallbackError);
            // Reject with the primary error as it's usually the most relevant to the file type
            reject(primaryError); 
          });
      });
  });
};

// Helper to sanitize sheet names for Excel (Max 31 chars, no invalid chars)
const sanitizeSheetName = (name: string): string => {
  if (!name) return "Unknown";
  // Remove invalid characters: [ ] : * ? / \
  const cleanName = name.replace(/[\[\]\:\*\?\/\\\\]/g, '_');
  // Truncate to 31 characters
  return cleanName.substring(0, 31);
};

// Helper to ensure data is primitive or string to avoid excel errors
const safeVal = (val: any) => {
  if (val === undefined || val === null) return "";
  return val;
};

// Export Logic
export const exportToExcel = async (processedData: ProcessedData, defaultFilename: string, selectedPersons: Set<string>) => {
  const workbook = XLSX.utils.book_new();

  // Create a specific sheet for Repurchase data (all sales persons aggregated)
  const repurchaseData: any[] = [];

  // 1. Process Individual Sales Persons
  Object.keys(processedData).sort().forEach((person) => {
    // Only export selected persons
    if (!selectedPersons.has(person)) return;

    const data = processedData[person];
    const wsData: any[][] = [];
    
    // Track rows for styling
    const sectionHeaderRows: number[] = [];
    const columnHeaderRows: number[] = [];

    // --- STAGE 1: Points Table ---
    // Rule: Exclude DELETE status. Separate REPURCHASE status.
    // Columns: 分類, 日期, 客戶編號, 品項編號, 品名, 數量, 計算點數
    
    wsData.push(["【第一階段：點數表】"]);
    sectionHeaderRows.push(wsData.length - 1);
    
    wsData.push(["分類", "日期", "客戶編號", "品項編號", "品名", "數量", "計算點數"]);
    columnHeaderRows.push(wsData.length - 1);
    
    data.stage1.forEach(row => {
      if (row.status === Stage1Status.DELETE) return; // Skip deleted

      if (row.status === Stage1Status.REPURCHASE) {
        // Collect for Repurchase Sheet
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
        // Add to main sheet
        wsData.push([
          safeVal(row.category),
          safeVal(row.date),
          safeVal(row.customerID),
          safeVal(row.itemID),
          safeVal(row.itemName),
          safeVal(row.quantity),
          safeVal(row.calculatedPoints)
        ]);
      }
    });

    wsData.push([], []); // Double Gap for better separation

    // --- STAGE 2: Cash Rewards ---
    // Rule: Exclude soft deleted items
    // Columns: 類別, 日期, 客戶編號, 品項編號, 品名, 數量, 備註, 獎勵
    // Updated Order: Category before Date
    
    wsData.push(["【第二階段：現金獎勵表】"]);
    sectionHeaderRows.push(wsData.length - 1);

    wsData.push(["類別", "日期", "客戶編號", "品項編號", "品名", "數量", "備註", "獎勵"]);
    columnHeaderRows.push(wsData.length - 1);
    
    data.stage2.forEach(row => {
      if (row.isDeleted) return; // Skip soft deleted

      let rewardDisplay = "";
      if (row.format === '禮券') {
        // Updated Format: <Qty>張<Label>
        rewardDisplay = `${row.quantity}張${safeVal(row.rewardLabel)}`;
      } else {
        // Cash: Use custom override if available, else default calc
        const amount = row.customReward !== undefined ? row.customReward : (row.quantity * row.reward);
        rewardDisplay = `${amount}元`;
      }

      wsData.push([
        safeVal(row.category),
        safeVal(row.displayDate),
        safeVal(row.customerID),
        safeVal(row.itemID),
        safeVal(row.itemName),
        safeVal(row.quantity),
        safeVal(row.note),
        safeVal(rewardDisplay)
      ]);
    });

    wsData.push([], []); // Double Gap

    // --- STAGE 3: Cosmetics ---
    wsData.push(["【第三階段：美妝金額】"]);
    sectionHeaderRows.push(wsData.length - 1);

    wsData.push(["品牌分類", "金額"]);
    columnHeaderRows.push(wsData.length - 1);
    
    data.stage3.rows.forEach(row => {
      wsData.push([safeVal(row.categoryName), safeVal(row.subTotal)]);
    });
    wsData.push(["總金額", safeVal(data.stage3.total)]);

    // Create Worksheet for this person
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Apply Column Widths (Approximation)
    ws['!cols'] = [
      { wch: 15 }, // A
      { wch: 8 },  // B
      { wch: 12 }, // C
      { wch: 12 }, // D
      { wch: 25 }, // E (Product Name)
      { wch: 8 },  // F (Qty)
      { wch: 20 }, // G (Note)
      { wch: 15 }  // H (Points/Reward)
    ];

    // Apply Styles (Attempt to set cell styles for headers)
    // Note: Standard XLSX Community Edition usually strips styles, but we add structure for compatibility.
    // Section Headers
    sectionHeaderRows.forEach(rowIndex => {
      // Assuming headers are in the first cell, or we span them.
      // We'll style the first cell of the row strongly.
      const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: 0 });
      if (!ws[cellRef]) ws[cellRef] = { v: wsData[rowIndex][0] };
      
      ws[cellRef].s = {
        font: { bold: true, sz: 14, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "4F81BD" } } // Blueish
      };
    });

    // Column Headers
    columnHeaderRows.forEach(rowIndex => {
      // Style all columns in this row
      const row = wsData[rowIndex];
      row.forEach((_, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
        if (ws[cellRef]) {
          ws[cellRef].s = {
            font: { bold: true },
            fill: { fgColor: { rgb: "DCE6F1" } } // Light Blue/Gray
          };
        }
      });
    });

    const validSheetName = sanitizeSheetName(person);
    
    // Check for duplicate sheet names (append index if needed)
    let finalSheetName = validSheetName;
    let counter = 1;
    while (workbook.SheetNames.includes(finalSheetName)) {
      finalSheetName = `${validSheetName.substring(0, 28)}(${counter})`;
      counter++;
    }

    XLSX.utils.book_append_sheet(workbook, ws, finalSheetName);
  });

  // 2. Create Repurchase Sheet if data exists
  if (repurchaseData.length > 0) {
    // Sort Repurchase Data by SalesPerson
    repurchaseData.sort((a, b) => String(a['銷售人員']).localeCompare(String(b['銷售人員'])));
    
    // Add header manually to ensure order
    const header = ['銷售人員', '分類', '日期', '客戶編號', '品項編號', '品名', '數量', '計算點數'];
    const sheetData = [header, ...repurchaseData.map(r => header.map(k => r[k]))];
    
    const wsRepurchase = XLSX.utils.aoa_to_sheet(sheetData);
    
    // Style Header
    header.forEach((_, colIndex) => {
       const cellRef = XLSX.utils.encode_cell({ r: 0, c: colIndex });
       if (wsRepurchase[cellRef]) {
         wsRepurchase[cellRef].s = {
           font: { bold: true },
           fill: { fgColor: { rgb: "FFFF00" } } // Yellow for Repurchase
         };
       }
    });

    wsRepurchase['!cols'] = [
      { wch: 10 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 8 }, { wch: 10 }
    ];

    XLSX.utils.book_append_sheet(workbook, wsRepurchase, "回購總表");
  }

  // --- SAVE FILE LOGIC (Modified for File Picker) ---
  
  // Method A: Use File System Access API (Modern Browsers - Chrome/Edge)
  if ('showSaveFilePicker' in window) {
    try {
      // @ts-ignore
      const handle = await window.showSaveFilePicker({
        suggestedName: `${defaultFilename}.xlsx`,
        types: [{
          description: 'Excel File',
          accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] },
        }],
      });
      
      // Write the file
      const writable = await handle.createWritable();
      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      await writable.write(new Blob([wbout], { type: 'application/octet-stream' }));
      await writable.close();
      return; // Success
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // User cancelled, do nothing
        return;
      }
      console.warn("File System Access API failed, falling back...", err);
      // Fall through to Method B
    }
  }

  // Method B: Fallback (Firefox, Safari, or if API fails)
  // Ask user for filename via prompt since we can't open a Save As dialog
  const userFilename = window.prompt("請輸入檔案名稱", defaultFilename);
  if (userFilename) {
    XLSX.writeFile(workbook, `${userFilename}.xlsx`);
  }
};
