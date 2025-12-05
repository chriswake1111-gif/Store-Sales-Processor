import React, { useState, useMemo } from 'react';
import { RawRow, ExclusionItem, RewardRule, ProcessedData, Stage1Status } from './types';
import { readExcelFile, exportToExcel } from './utils/excelHelper';
import { processStage1, processStage2, processStage3, recalculateStage1Points, generateEmptyStage3Rows } from './utils/processor';
import FileUploader from './components/FileUploader';
import PopoutWindow from './components/PopoutWindow';
import DataViewer from './components/DataViewer';
import { Download, Maximize2, AlertCircle } from 'lucide-react';

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

  const handleExport = () => {
    if (Object.keys(processedData).length === 0) return;
    if (selectedPersons.size === 0) {
      alert("請至少選擇一位銷售人員進行匯出");
      return;
    }
    exportToExcel(processedData, `獎金計算報表_${new Date().toISOString().slice(0,10)}`, selectedPersons);
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
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            分店獎金計算系統 <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">V0.9</span>
          </h1>
          <div className="flex gap-3">
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