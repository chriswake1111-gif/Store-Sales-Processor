
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RawRow, ExclusionItem, RewardRule, ProcessedData, Stage1Status } from './types';
import { readExcelFile, exportToExcel } from './utils/excelHelper';
import { processStage1, processStage2, processStage3, recalculateStage1Points, generateEmptyStage3Rows } from './utils/processor';
import { saveToLocal, loadFromLocal, checkSavedData } from './utils/storage';
import FileUploader from './components/FileUploader';
import PopoutWindow from './components/PopoutWindow';
import DataViewer from './components/DataViewer';
import { Download, Maximize2, AlertCircle, MonitorDown, Save, FolderOpen } from 'lucide-react';

const App: React.FC = () => {
  // --- State ---
  const [exclusionList, setExclusionList] = useState<ExclusionItem[]>([]);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [rawSalesData, setRawSalesData] = useState<RawRow[]>([]);
  
  // The master processed data state
  const [processedData, setProcessedData] = useState<ProcessedData>({});
  
  // UI State
  const [activePerson, setActivePerson] = useState<string>('');
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'stage1' | 'stage2' | 'stage3'>('stage1');
  const [isPopOut, setIsPopOut] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto Save State
  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [hasAutoSave, setHasAutoSave] = useState<boolean>(false);
  
  // Ref to hold current state for auto-save interval to access without closure issues
  const stateRef = useRef({
    exclusionList,
    rewardRules,
    rawSalesData,
    processedData,
    activePerson,
    selectedPersons
  });

  // PWA Install Prompt State
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  // 1. Check for existing save on mount
  useEffect(() => {
    const ts = checkSavedData();
    if (ts) {
      setHasAutoSave(true);
      setLastSaveTime(ts);
    }

    const handler = (e: any) => {
      e.preventDefault();
      console.log('PWA: beforeinstallprompt event fired'); // Debug log
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  // 2. Sync Ref with State
  useEffect(() => {
    stateRef.current = {
      exclusionList,
      rewardRules,
      rawSalesData,
      processedData,
      activePerson,
      selectedPersons
    };
  }, [exclusionList, rewardRules, rawSalesData, processedData, activePerson, selectedPersons]);

  // 3. Auto Save Interval (Every 3 minutes)
  useEffect(() => {
    const intervalId = setInterval(() => {
      // Only save if we have data to save
      if (stateRef.current.rawSalesData.length > 0) {
        const ts = saveToLocal(stateRef.current);
        if (ts) {
          setLastSaveTime(ts);
          setHasAutoSave(true);
          console.log("Auto-saved at", new Date(ts).toLocaleTimeString());
        }
      }
    }, 3 * 60 * 1000); // 3 minutes

    return () => clearInterval(intervalId);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  // --- Auto Save Handlers ---
  
  const handleLoadSave = () => {
    const saved = loadFromLocal();
    if (saved) {
      if (Object.keys(processedData).length > 0) {
        if (!window.confirm("目前已有編輯中的資料，讀取存檔將會覆蓋，確定要讀取嗎？")) {
          return;
        }
      }

      setExclusionList(saved.exclusionList);
      setRewardRules(saved.rewardRules);
      setRawSalesData(saved.rawSalesData);
      setProcessedData(saved.processedData);
      setActivePerson(saved.activePerson);
      setSelectedPersons(new Set(saved.selectedPersons));
      setLastSaveTime(saved.timestamp);
      alert(`已成功還原 ${new Date(saved.timestamp).toLocaleString()} 的自動存檔`);
    }
  };

  // --- Handlers ---

  const handleImportExclusion = async (file: File) => {
    try {
      const json = await readExcelFile(file);
      const list: ExclusionItem[] = json.map((row: any) => ({
        itemID: row['品項編號'] || row['Item ID'] || Object.values(row)[0] // Fallback
      }));
      setExclusionList(list);
    } catch (e) {
      alert("匯入排除清單失敗: " + e);
    }
  };

  const handleImportRewards = async (file: File) => {
    try {
      const json = await readExcelFile(file);
      const list: RewardRule[] = json.map((row: any) => ({
        itemID: row['品項編號'],
        note: row['備註'],
        category: row['類別'],
        reward: Number(row['獎勵金額'] || row['獎勵'] || row['金額'] || 0),
        rewardLabel: String(row['獎勵金額'] || row['獎勵'] || row['金額'] || ''),
        format: row['形式'] || '現金'
      }));
      setRewardRules(list);
    } catch (e) {
      alert("匯入獎勵清單失敗: " + e);
    }
  };

  const handleImportSales = async (file: File) => {
    if (exclusionList.length === 0 || rewardRules.length === 0) {
      alert("請先匯入排除清單與獎勵清單！");
      return;
    }

    // Check for existing save before importing new sales report
    if (hasAutoSave) {
       const confirmImport = window.confirm(
         "偵測到有自動存檔紀錄。匯入新的銷售報表將會覆蓋目前的進度（包含自動存檔），確定要繼續嗎？"
       );
       if (!confirmImport) return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const json = await readExcelFile(file);
      setRawSalesData(json);
      processAllStages(json, exclusionList, rewardRules);
    } catch (e) {
      setErrorMsg("銷售報表處理失敗: " + e);
    } finally {
      setIsProcessing(false);
    }
  };

  const processAllStages = (rawData: RawRow[], exclusions: ExclusionItem[], rewards: RewardRule[]) => {
    try {
      // Stage 1
      const s1 = processStage1(rawData, exclusions);
      // Stage 2
      const s2 = processStage2(rawData, rewards);
      // Stage 3
      const s3 = processStage3(rawData);

      // Grouping by Person
      const grouped: ProcessedData = {};
      const people = new Set([
        ...s1.map(r => r.salesPerson),
        ...s2.map(r => r.salesPerson),
        ...s3.map(r => r.salesPerson)
      ]);

      people.forEach(person => {
        grouped[person] = {
          stage1: s1.filter(r => r.salesPerson === person),
          stage2: s2.filter(r => r.salesPerson === person),
          stage3: s3.find(r => r.salesPerson === person) || { 
            salesPerson: person, 
            rows: generateEmptyStage3Rows(), 
            total: 0 
          }
        };
      });

      setProcessedData(grouped);
      // Select all by default
      setSelectedPersons(new Set(people));
      
      if (people.size > 0) setActivePerson(Array.from(people)[0]);
      
    } catch (e) {
      setErrorMsg("資料篩選運算錯誤: " + e);
    }
  };

  // --- Actions ---

  const handleStatusChangeStage1 = (id: string, newStatus: Stage1Status) => {
    if (!activePerson) return;
    setProcessedData(prev => {
      const newData = { ...prev };
      const rows = [...newData[activePerson].stage1];
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) {
        const updatedRow = { ...rows[idx], status: newStatus };
        updatedRow.calculatedPoints = recalculateStage1Points(updatedRow);
        rows[idx] = updatedRow;
        newData[activePerson].stage1 = rows;
      }
      return newData;
    });
  };

  const handleToggleDeleteStage2 = (id: string) => {
    if (!activePerson) return;
    setProcessedData(prev => {
      const newData = { ...prev };
      const rows = [...newData[activePerson].stage2];
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) {
        // Toggle deletion state
        const updatedRow = { ...rows[idx], isDeleted: !rows[idx].isDeleted };
        rows[idx] = updatedRow;
        newData[activePerson].stage2 = rows;
      }
      return newData;
    });
  };

  const handleUpdateStage2CustomReward = (id: string, val: string) => {
    if (!activePerson) return;
    setProcessedData(prev => {
      const newData = { ...prev };
      const rows = [...newData[activePerson].stage2];
      const idx = rows.findIndex(r => r.id === id);
      if (idx !== -1) {
        const numVal = val === '' ? undefined : Number(val);
        const updatedRow = { ...rows[idx], customReward: isNaN(numVal as number) ? undefined : numVal };
        rows[idx] = updatedRow;
        newData[activePerson].stage2 = rows;
      }
      return newData;
    });
  };

  const handleExport = async () => {
    if (Object.keys(processedData).length === 0) return;
    if (selectedPersons.size === 0) {
      alert("請至少選擇一位銷售人員進行匯出");
      return;
    }
    const defaultName = `獎金計算報表_${new Date().toISOString().slice(0,10)}`;
    await exportToExcel(processedData, defaultName, selectedPersons);
  };

  const togglePersonSelection = (person: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedPersons);
    if (newSet.has(person)) {
      newSet.delete(person);
    } else {
      newSet.add(person);
    }
    setSelectedPersons(newSet);
  };

  // --- Render Helpers ---

  const sortedPeople = useMemo(() => Object.keys(processedData).sort(), [processedData]);

  const currentData = useMemo(() => {
    return activePerson ? processedData[activePerson] : null;
  }, [processedData, activePerson]);

  const stage1TotalPoints = useMemo(() => {
     if (!currentData) return 0;
     return currentData.stage1.reduce((sum, row) => sum + (row.status !== Stage1Status.DELETE ? row.calculatedPoints : 0), 0);
  }, [currentData]);

  const dataViewerProps = {
    sortedPeople,
    selectedPersons,
    togglePersonSelection,
    activePerson,
    setActivePerson,
    currentData,
    activeTab,
    setActiveTab,
    stage1TotalPoints,
    handleStatusChangeStage1,
    handleToggleDeleteStage2,
    handleUpdateStage2CustomReward,
    onClose: isPopOut ? () => setIsPopOut(false) : undefined // Pass onClose if in PopOut mode
  };

  return (
    <>
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header / Toolbar */}
        <div className="bg-white border-b shadow-sm px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              分店獎金計算系統 <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">V0.921</span>
            </h1>
            {lastSaveTime && (
               <span className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                 <Save size={12}/> 自動儲存於: {new Date(lastSaveTime).toLocaleTimeString()}
               </span>
            )}
          </div>
          <div className="flex gap-3">
             {hasAutoSave && (
               <button
                 onClick={handleLoadSave}
                 className="flex items-center gap-2 px-3 py-2 text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors border border-amber-200"
                 title="讀取上次的自動存檔"
               >
                 <FolderOpen size={16} /> 讀取自動存檔
               </button>
             )}
          
             {deferredPrompt && (
               <button
                 onClick={handleInstallClick}
                 className="flex items-center gap-2 px-3 py-2 text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors border border-blue-200"
               >
                 <MonitorDown size={16} /> 安裝應用程式
               </button>
             )}
             
             <button 
               onClick={() => setIsPopOut(true)}
               disabled={Object.keys(processedData).length === 0}
               className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
             >
               <Maximize2 size={16}/> 開啟小視窗
             </button>
             <button 
               onClick={handleExport}
               disabled={Object.keys(processedData).length === 0}
               className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg shadow hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
             >
               <Download size={18} /> 匯出報表
             </button>
          </div>
        </div>

        {/* Input Area */}
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
            <FileUploader 
              label="1. 匯入藥師點數排除清單" 
              onFileSelect={handleImportExclusion}
              isLoaded={exclusionList.length > 0}
            />
            <FileUploader 
              label="2. 匯入現金獎勵清單" 
              onFileSelect={handleImportRewards}
              isLoaded={rewardRules.length > 0}
            />
            <FileUploader 
              label="3. 匯入銷售報表" 
              onFileSelect={handleImportSales}
              disabled={exclusionList.length === 0 || rewardRules.length === 0}
              isLoaded={rawSalesData.length > 0}
            />
        </div>

        {/* Error Message */}
        {errorMsg && (
          <div className="mx-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex items-center gap-2">
            <AlertCircle size={20} />
            {errorMsg}
          </div>
        )}

        {/* Main View */}
        {sortedPeople.length > 0 && (
          <div className="flex-1 overflow-hidden px-6 pb-6 pt-2">
             <div className="h-full border rounded-lg shadow-sm overflow-hidden">
                <DataViewer {...dataViewerProps} />
             </div>
          </div>
        )}
      </div>

      {/* Popout Window Portal */}
      {isPopOut && (
        <PopoutWindow title="結果預覽 - 分店獎金計算系統" onClose={() => setIsPopOut(false)}>
           <DataViewer {...dataViewerProps} />
        </PopoutWindow>
      )}
    </>
  );
};

export default App;
