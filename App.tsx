import React, { useState, useMemo, useEffect, useRef } from 'react';
import { RawRow, ExclusionItem, RewardRule, ProcessedData, Stage1Status } from './types';
import { readExcelFile, exportToExcel } from './utils/excelHelper';
import { processStage1, processStage2, processStage3, recalculateStage1Points, generateEmptyStage3Rows } from './utils/processor';
import { saveToLocal, loadFromLocal, checkSavedData } from './utils/storage';
import FileUploader from './components/FileUploader';
import PopoutWindow from './components/PopoutWindow';
import DataViewer from './components/DataViewer';
import { Download, Maximize2, AlertCircle, MonitorDown, Save, FolderOpen, X } from 'lucide-react';

const App: React.FC = () => {
  const [exclusionList, setExclusionList] = useState<ExclusionItem[]>([]);
  const [rewardRules, setRewardRules] = useState<RewardRule[]>([]);
  const [rawSalesData, setRawSalesData] = useState<RawRow[]>([]);
  const [processedData, setProcessedData] = useState<ProcessedData>({});
  
  const [activePerson, setActivePerson] = useState<string>('');
  const [selectedPersons, setSelectedPersons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'stage1' | 'stage2' | 'stage3'>('stage1');
  const [isPopOut, setIsPopOut] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [lastSaveTime, setLastSaveTime] = useState<number | null>(null);
  const [hasAutoSave, setHasAutoSave] = useState<boolean>(false);
  
  // PWA States
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  
  const stateRef = useRef({ exclusionList, rewardRules, rawSalesData, processedData, activePerson, selectedPersons });

  useEffect(() => {
    const ts = checkSavedData();
    if (ts) { setHasAutoSave(true); setLastSaveTime(ts); }

    // Step 5: Check Display Mode
    const checkStandalone = () => {
      const isApp = window.matchMedia('(display-mode: standalone)').matches;
      setIsStandalone(isApp);
    };
    
    checkStandalone();
    window.matchMedia('(display-mode: standalone)').addEventListener('change', checkStandalone);

    // Step 4: Capture Install Prompt
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      console.log('PWA install prompt captured');
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
      console.log('PWA was installed');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    stateRef.current = { exclusionList, rewardRules, rawSalesData, processedData, activePerson, selectedPersons };
  }, [exclusionList, rewardRules, rawSalesData, processedData, activePerson, selectedPersons]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (stateRef.current.rawSalesData.length > 0) {
        const ts = saveToLocal(stateRef.current);
        if (ts) { setLastSaveTime(ts); setHasAutoSave(true); }
      }
    }, 3 * 60 * 1000);
    return () => clearInterval(intervalId);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    setDeferredPrompt(null);
  };

  const handleLoadSave = () => {
    const saved = loadFromLocal();
    if (saved) {
      if (Object.keys(processedData).length > 0 && !window.confirm("讀取存檔將覆蓋目前資料，確定要讀取嗎？")) return;
      setExclusionList(saved.exclusionList); setRewardRules(saved.rewardRules);
      setRawSalesData(saved.rawSalesData); setProcessedData(saved.processedData);
      setActivePerson(saved.activePerson); setSelectedPersons(new Set(saved.selectedPersons));
      setLastSaveTime(saved.timestamp);
      alert(`已還原 ${new Date(saved.timestamp).toLocaleString()} 的存檔`);
    }
  };

  const handleImportExclusion = async (file: File) => {
    try {
      const json = await readExcelFile(file);
      setExclusionList(json.map((row: any) => ({ itemID: row['品項編號'] || row['Item ID'] || Object.values(row)[0] })));
    } catch (e) { alert("匯入失敗: " + e); }
  };

  const handleImportRewards = async (file: File) => {
    try {
      const json = await readExcelFile(file);
      setRewardRules(json.map((row: any) => ({
        itemID: row['品項編號'], note: row['備註'], category: row['類別'],
        reward: Number(row['獎勵金額'] || row['獎勵'] || row['金額'] || 0),
        rewardLabel: String(row['獎勵金額'] || row['獎勵'] || row['金額'] || ''),
        format: row['形式'] || '現金'
      })));
    } catch (e) { alert("匯入失敗: " + e); }
  };

  const handleImportSales = async (file: File) => {
    if (!exclusionList.length || !rewardRules.length) return alert("請先匯入排除與獎勵清單！");
    if (hasAutoSave && !window.confirm("匯入新報表將覆蓋自動存檔，確定？")) return;

    setErrorMsg(null);
    try {
      const json = await readExcelFile(file);
      setRawSalesData(json);
      const s1 = processStage1(json, exclusionList);
      const s2 = processStage2(json, rewardRules);
      const s3 = processStage3(json);
      const grouped: ProcessedData = {};
      const people = new Set([...s1, ...s2, ...s3].map(r => r.salesPerson));

      people.forEach(person => {
        grouped[person] = {
          stage1: s1.filter(r => r.salesPerson === person),
          stage2: s2.filter(r => r.salesPerson === person),
          stage3: s3.find(r => r.salesPerson === person) || { salesPerson: person, rows: generateEmptyStage3Rows(), total: 0 }
        };
      });
      setProcessedData(grouped); setSelectedPersons(people); if (people.size) setActivePerson(Array.from(people)[0]);
    } catch (e) { setErrorMsg("處理失敗: " + e); }
  };

  const handleExport = async () => {
    if (!selectedPersons.size) return alert("請選擇銷售人員");
    await exportToExcel(processedData, `獎金計算報表_${new Date().toISOString().slice(0,10)}`, selectedPersons);
  };

  const updateData = (updater: (d: ProcessedData) => void) => {
    if (!activePerson) return;
    setProcessedData(prev => { const n = { ...prev }; updater(n); return n; });
  };
  const handleStatusChangeStage1 = (id: string, s: Stage1Status) => updateData(d => {
    const rows = d[activePerson].stage1; const i = rows.findIndex(r => r.id === id);
    if (i !== -1) { rows[i] = { ...rows[i], status: s, calculatedPoints: recalculateStage1Points({ ...rows[i], status: s }) }; }
  });
  const handleToggleDeleteStage2 = (id: string) => updateData(d => {
    const rows = d[activePerson].stage2; const i = rows.findIndex(r => r.id === id);
    if (i !== -1) rows[i].isDeleted = !rows[i].isDeleted;
  });
  const handleUpdateStage2CustomReward = (id: string, val: string) => updateData(d => {
    const rows = d[activePerson].stage2; const i = rows.findIndex(r => r.id === id);
    if (i !== -1) rows[i].customReward = val === '' ? undefined : Number(val);
  });

  const sortedPeople = useMemo(() => Object.keys(processedData).sort(), [processedData]);
  const currentData = useMemo(() => activePerson ? processedData[activePerson] : null, [processedData, activePerson]);
  const stage1TotalPoints = useMemo(() => currentData?.stage1.reduce((sum, r) => sum + (r.status !== Stage1Status.DELETE ? r.calculatedPoints : 0), 0) || 0, [currentData]);

  const dvProps = {
    sortedPeople, selectedPersons, togglePersonSelection: (p: string, e: any) => { e.stopPropagation(); const s = new Set(selectedPersons); s.has(p) ? s.delete(p) : s.add(p); setSelectedPersons(s); },
    activePerson, setActivePerson, currentData, activeTab, setActiveTab, stage1TotalPoints,
    handleStatusChangeStage1, handleToggleDeleteStage2, handleUpdateStage2CustomReward, onClose: isPopOut ? () => setIsPopOut(false) : undefined
  };

  return (
    <>
      <div className="flex flex-col h-full bg-gray-50">
        {/* Step 5: Recommendation Bar for Browser Mode */}
        {!isStandalone && deferredPrompt && (
          <div className="bg-amber-100 border-b border-amber-200 px-4 py-2 flex items-center justify-between text-amber-800 text-sm">
             <div className="flex items-center gap-2">
               <MonitorDown size={16} />
               <span>建議您將此系統安裝到電腦桌面，獲得最佳的全螢幕操作體驗。</span>
             </div>
             <button 
               onClick={handleInstallClick}
               className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1 rounded shadow-sm text-xs font-bold transition-colors"
             >
               立即安裝應用程式
             </button>
          </div>
        )}

        <div className="bg-white border-b shadow-sm px-6 py-4 flex justify-between shrink-0">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">分店獎金計算系統 <span className="text-xs bg-gray-100 px-2 rounded-full border">V0.922</span></h1>
            {lastSaveTime && <span className="text-xs text-gray-400 mt-1 flex gap-1"><Save size={12}/> 自動儲存於: {new Date(lastSaveTime).toLocaleTimeString()}</span>}
          </div>
          <div className="flex gap-3">
             {hasAutoSave && <button onClick={handleLoadSave} className="flex gap-2 px-3 py-2 text-amber-700 bg-amber-50 rounded-lg border border-amber-200"><FolderOpen size={16} /> 讀取存檔</button>}
             <button onClick={() => setIsPopOut(true)} disabled={!Object.keys(processedData).length} className="flex gap-2 px-4 py-2 bg-gray-100 rounded-lg disabled:opacity-50"><Maximize2 size={16}/> 小視窗</button>
             <button onClick={handleExport} disabled={!Object.keys(processedData).length} className="flex gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300"><Download size={18} /> 匯出</button>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 shrink-0">
            <FileUploader label="1. 匯入排除清單" onFileSelect={handleImportExclusion} isLoaded={exclusionList.length > 0} />
            <FileUploader label="2. 匯入現金獎勵" onFileSelect={handleImportRewards} isLoaded={rewardRules.length > 0} />
            <FileUploader label="3. 匯入銷售報表" onFileSelect={handleImportSales} disabled={!exclusionList.length || !rewardRules.length} isLoaded={rawSalesData.length > 0} />
        </div>
        {errorMsg && <div className="mx-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 flex gap-2"><AlertCircle size={20} />{errorMsg}</div>}
        {sortedPeople.length > 0 && <div className="flex-1 overflow-hidden px-6 pb-6 pt-2"><div className="h-full border rounded-lg shadow-sm overflow-hidden"><DataViewer {...dvProps} /></div></div>}
      </div>
      {isPopOut && <PopoutWindow title="結果預覽" onClose={() => setIsPopOut(false)}><DataViewer {...dvProps} /></PopoutWindow>}
    </>
  );
};
export default App;