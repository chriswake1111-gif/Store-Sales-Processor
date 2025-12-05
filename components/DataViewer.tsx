import React, { useMemo } from 'react';
import { ProcessedData, Stage1Status } from '../types';
import { Trash2, RotateCcw, CheckSquare, Square, Minimize2 } from 'lucide-react';

interface DataViewerProps {
  sortedPeople: string[];
  selectedPersons: Set<string>;
  togglePersonSelection: (person: string, e: React.MouseEvent) => void;
  activePerson: string;
  setActivePerson: (person: string) => void;
  currentData: ProcessedData[string] | null;
  activeTab: 'stage1' | 'stage2' | 'stage3';
  setActiveTab: (tab: 'stage1' | 'stage2' | 'stage3') => void;
  stage1TotalPoints: number;
  handleStatusChangeStage1: (id: string, newStatus: Stage1Status) => void;
  handleToggleDeleteStage2: (id: string) => void;
  handleUpdateStage2CustomReward: (id: string, val: string) => void;
  onClose?: () => void;
}

const DataViewer: React.FC<DataViewerProps> = ({
  sortedPeople, selectedPersons, togglePersonSelection, activePerson, setActivePerson,
  currentData, activeTab, setActiveTab, stage1TotalPoints,
  handleStatusChangeStage1, handleToggleDeleteStage2, handleUpdateStage2CustomReward, onClose
}) => {
  
  const stage2Totals = useMemo(() => {
    return currentData?.stage2.reduce((acc, row) => {
      if (row.isDeleted) return acc;
      if (row.format === '禮券') {
        acc.vouchers += row.quantity;
      } else {
        const amount = row.customReward !== undefined ? row.customReward : (row.quantity * row.reward);
        acc.cash += amount;
      }
      return acc;
    }, { cash: 0, vouchers: 0 }) || { cash: 0, vouchers: 0 };
  }, [currentData?.stage2]);

  if (!currentData) {
    return (
      <div className="flex flex-col h-full bg-white items-center justify-center text-gray-400">
        <p>請選擇銷售人員以檢視資料</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sales Person Tabs */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 pt-2 shrink-0">
        <div className="flex gap-1 overflow-x-auto flex-1 no-scrollbar">
          {sortedPeople.map(person => {
            const isSelected = selectedPersons.has(person);
            return (
              <div key={person} onClick={() => setActivePerson(person)}
                className={`group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium cursor-pointer border-t border-l border-r select-none
                  ${activePerson === person ? 'bg-white border-gray-300 border-b-white text-blue-700 relative z-10' : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200'}`}>
                <button onClick={(e) => togglePersonSelection(person, e)} className={`hover:text-blue-600 ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}>
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                {person}
              </div>
            );
          })}
        </div>
        {onClose && (
           <button onClick={onClose} className="ml-2 mb-1 text-gray-600 hover:text-red-600 flex items-center gap-1 text-xs px-2 py-1 bg-white border rounded shadow-sm">
             <Minimize2 size={14} /> 關閉視窗
           </button>
        )}
      </div>

      {/* Stage Tabs */}
      <div className="flex bg-gray-100 border-b border-gray-200">
        {[
          { id: 'stage1', label: '第一階段：點數表', count: `${stage1TotalPoints} 點`, color: 'blue' },
          { id: 'stage2', label: '第二階段：現金獎勵表', count: currentData.stage2.filter(r => !r.isDeleted).length, color: 'green' },
          { id: 'stage3', label: '第三階段：美妝金額', count: `$${currentData.stage3.total.toLocaleString()}`, color: 'purple' }
        ].map((tab: any) => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 px-4 text-sm font-bold flex justify-center items-center gap-2 transition-all border-b-4
              ${activeTab === tab.id 
                ? `bg-${tab.color}-50 text-${tab.color}-800 border-${tab.color}-500` 
                : 'text-gray-500 border-transparent hover:bg-gray-200'}`}>
            {tab.label}
            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.id ? `bg-${tab.color}-200 text-${tab.color}-800` : 'bg-gray-300'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white">
        {activeTab === 'stage1' && (
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-blue-50 text-blue-900 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-24">狀態</th><th className="p-3">分類</th><th className="p-3">日期</th><th className="p-3">客戶編號</th>
                <th className="p-3">品項編號</th><th className="p-3">品名</th><th className="p-3 text-right">數量</th><th className="p-3 text-right">計算點數</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {currentData.stage1.map(row => {
                const isDel = row.status === Stage1Status.DELETE;
                const isRep = row.status === Stage1Status.REPURCHASE;
                return (
                  <tr key={row.id} className={isDel ? 'bg-gray-50' : 'hover:bg-blue-50'}>
                    <td className="p-3">
                      <select value={row.status} onChange={(e) => handleStatusChangeStage1(row.id, e.target.value as Stage1Status)}
                        className={`border rounded px-2 py-1 text-xs w-full ${isRep ? 'bg-orange-50 text-orange-600' : isDel ? 'bg-red-50 text-red-600' : 'bg-white'}`}>
                        <option value={Stage1Status.DEVELOP}>開發</option><option value={Stage1Status.HALF_YEAR}>隔半年</option>
                        <option value={Stage1Status.REPURCHASE}>回購</option><option value={Stage1Status.DELETE}>刪除</option>
                      </select>
                    </td>
                    <td className={`p-3 ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.category}</td>
                    <td className={`p-3 ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.date}</td>
                    <td className={`p-3 ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.customerID}</td>
                    <td className={`p-3 ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.itemID}</td>
                    <td className={`p-3 font-medium ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.itemName}</td>
                    <td className={`p-3 text-right ${isDel ? 'line-through decoration-red-500 text-gray-400' : ''}`}>{row.quantity}</td>
                    <td className={`p-3 text-right font-bold ${isDel ? 'text-gray-400 line-through' : isRep ? 'text-amber-600' : 'text-blue-600'}`}>{isDel ? 0 : row.calculatedPoints}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {activeTab === 'stage2' && (
          <div className="relative">
            <div className="sticky top-0 bg-white z-20 px-4 py-2 border-b border-green-100 text-sm flex justify-between">
              <span className="text-xs text-gray-400 flex items-center gap-1"><Trash2 size={12}/> 灰色刪除鍵為暫時刪除</span>
              <div className="bg-green-50 px-3 py-1 rounded-lg border border-green-100 font-bold text-green-700">
                現金 ${stage2Totals.cash.toLocaleString()} | 禮券 {stage2Totals.vouchers} 張
              </div>
            </div>
            <table className="w-full text-sm text-left whitespace-nowrap">
              <thead className="bg-green-50 text-green-900 sticky top-12 z-10">
                <tr>
                  <th className="p-3 w-12">刪除</th><th className="p-3">類別</th><th className="p-3">日期</th><th className="p-3">客戶編號</th>
                  <th className="p-3">品項編號</th><th className="p-3">品名</th><th className="p-3 text-right">數量</th><th className="p-3">備註</th><th className="p-3 text-right">獎勵</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {currentData.stage2.map(row => {
                  const isDel = row.isDeleted;
                  const txtCls = isDel ? 'line-through decoration-red-500 text-gray-400' : 'text-gray-700';
                  return (
                    <tr key={row.id} className={isDel ? 'bg-red-50' : 'hover:bg-green-50'}>
                      <td className="p-2 text-center">
                        <button onClick={() => handleToggleDeleteStage2(row.id)} className={`p-1 rounded ${isDel ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-red-500'}`}>
                          {isDel ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                        </button>
                      </td>
                      <td className={`p-3 ${txtCls}`}>{row.category}</td>
                      <td className={`p-3 ${txtCls}`}>{row.displayDate}</td>
                      <td className={`p-3 ${txtCls}`}>{row.customerID}</td>
                      <td className={`p-3 ${txtCls}`}>{row.itemID}</td>
                      <td className={`p-3 font-medium ${txtCls}`}>{row.itemName}</td>
                      <td className={`p-3 text-right ${txtCls}`}>{row.quantity}</td>
                      <td className={`p-3 text-xs truncate max-w-[200px] ${txtCls}`}>{row.note}</td>
                      <td className={`p-3 text-right font-bold ${txtCls}`}>
                        {row.format === '禮券' ? 
                          <span className="text-purple-600">{row.quantity}張 <span className="text-gray-500 text-xs">{row.rewardLabel}</span></span> 
                          : 
                          <div className="flex justify-end items-center gap-1">
                            <input type="number" disabled={isDel} value={row.customReward ?? (row.quantity * row.reward)}
                              onChange={(e) => handleUpdateStage2CustomReward(row.id, e.target.value)}
                              className={`w-20 text-right border-b focus:border-green-500 bg-transparent outline-none ${row.customReward !== undefined ? 'text-green-600' : ''}`} />
                            <span className="text-xs">元</span>
                          </div>
                        }
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {activeTab === 'stage3' && (
          <div className="p-6 max-w-lg mx-auto">
            <table className="w-full text-sm border rounded-lg shadow-sm">
              <thead className="bg-purple-50 text-purple-900"><tr><th className="p-4 text-left">品牌分類</th><th className="p-4 text-right">金額</th></tr></thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {currentData.stage3.rows.map(row => (
                  <tr key={row.categoryName}><td className="p-4">{row.categoryName}</td><td className="p-4 text-right font-mono">${row.subTotal.toLocaleString()}</td></tr>
                ))}
                <tr className="bg-purple-50 font-bold"><td className="p-4 text-purple-900">總金額</td><td className="p-4 text-right text-purple-700 text-lg">${currentData.stage3.total.toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default DataViewer;