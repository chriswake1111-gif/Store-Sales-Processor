
import React from 'react';
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
  onClose?: () => void; // Optional Close Handler for Popout mode
}

const DataViewer: React.FC<DataViewerProps> = ({
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
  onClose
}) => {
  
  // Calculate Totals: Cash vs Voucher
  const stage2Totals = currentData?.stage2.reduce((acc, row) => {
    if (row.isDeleted) return acc;
    if (row.format === '禮券') {
      acc.vouchers += row.quantity;
    } else {
      // For Cash: Use customOverride if exists, else Quantity * Unit Reward
      const amount = row.customReward !== undefined ? row.customReward : (row.quantity * row.reward);
      acc.cash += amount;
    }
    return acc;
  }, { cash: 0, vouchers: 0 }) || { cash: 0, vouchers: 0 };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Sales Person Tabs & Controls */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-2 pt-2 shrink-0">
        <div className="flex gap-1 overflow-x-auto flex-1 no-scrollbar">
          {sortedPeople.map(person => {
            const isSelected = selectedPersons.has(person);
            return (
              <div
                key={person}
                onClick={() => setActivePerson(person)}
                className={`
                      group flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all whitespace-nowrap cursor-pointer border-t border-l border-r select-none
                      ${activePerson === person
                    ? 'bg-white border-gray-300 border-b-white text-blue-700 shadow-[0_-2px_5px_rgba(0,0,0,0.05)] relative z-10'
                    : 'bg-gray-100 border-transparent text-gray-500 hover:bg-gray-200 border-b-gray-300'}
                    `}
              >
                <button
                  onClick={(e) => togglePersonSelection(person, e)}
                  className={`hover:text-blue-600 transition-colors ${isSelected ? 'text-blue-500' : 'text-gray-400'}`}
                >
                  {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                </button>
                {person}
              </div>
            );
          })}
        </div>
        
        {/* Close Button Integration */}
        {onClose && (
           <button onClick={onClose} className="ml-2 mb-1 text-gray-600 hover:text-red-600 flex items-center gap-1 text-xs px-2 py-1 bg-white border rounded shadow-sm transition-colors">
             <Minimize2 size={14} /> 關閉視窗
           </button>
        )}
      </div>

      {/* Data Stage Tabs */}
      {currentData ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Distinct Tab Bar */}
          <div className="flex bg-gray-100 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('stage1')}
              className={`flex-1 py-3 px-4 text-sm font-bold flex justify-center items-center gap-2 transition-all border-b-4
                ${activeTab === 'stage1' 
                  ? 'bg-blue-50 text-blue-800 border-blue-500 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05)]' 
                  : 'text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'}`}
            >
              第一階段：點數表
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'stage1' ? 'bg-red-100 text-red-600' : 'bg-gray-300 text-gray-600'}`}>
                {stage1TotalPoints} 點
              </span>
            </button>
            <button
              onClick={() => setActiveTab('stage2')}
              className={`flex-1 py-3 px-4 text-sm font-bold flex justify-center items-center gap-2 transition-all border-b-4
                ${activeTab === 'stage2' 
                  ? 'bg-green-50 text-green-800 border-green-500 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05)]' 
                  : 'text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'}`}
            >
              第二階段：現金獎勵表
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'stage2' ? 'bg-green-200 text-green-800' : 'bg-gray-300 text-gray-600'}`}>
                {currentData.stage2.filter(r => !r.isDeleted).length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('stage3')}
              className={`flex-1 py-3 px-4 text-sm font-bold flex justify-center items-center gap-2 transition-all border-b-4
                ${activeTab === 'stage3' 
                  ? 'bg-purple-50 text-purple-800 border-purple-500 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.05)]' 
                  : 'text-gray-500 border-transparent hover:bg-gray-200 hover:text-gray-700'}`}
            >
              第三階段：美妝金額
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${activeTab === 'stage3' ? 'bg-purple-200 text-purple-800' : 'bg-gray-300 text-gray-600'}`}>
                 ${currentData.stage3.total.toLocaleString()}
              </span>
            </button>
          </div>

          {/* Table Content */}
          <div className="flex-1 overflow-auto bg-white relative">
            {activeTab === 'stage1' && (
              <table className="w-full text-sm text-left whitespace-nowrap">
                <thead className="bg-blue-50 text-blue-900 sticky top-0 z-10 shadow-sm">
                  <tr>
                    <th className="p-3 font-semibold w-24 border-b border-blue-100">狀態</th>
                    <th className="p-3 font-semibold border-b border-blue-100">分類</th>
                    <th className="p-3 font-semibold border-b border-blue-100">日期</th>
                    <th className="p-3 font-semibold border-b border-blue-100">客戶編號</th>
                    <th className="p-3 font-semibold border-b border-blue-100">品項編號</th>
                    <th className="p-3 font-semibold border-b border-blue-100">品名</th>
                    <th className="p-3 font-semibold text-right border-b border-blue-100">數量</th>
                    <th className="p-3 font-semibold text-right border-b border-blue-100">計算點數</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {currentData.stage1.map(row => {
                    const isDeleted = row.status === Stage1Status.DELETE;
                    const isRepurchase = row.status === Stage1Status.REPURCHASE;
                    
                    // Visual styles for deleted row: red strikethrough line, gray text
                    const rowClass = isDeleted ? 'bg-gray-50' : 'hover:bg-blue-50 transition-colors';
                    const textClass = isDeleted ? 'line-through decoration-red-500 decoration-2 text-gray-400' : 'text-gray-700';

                    return (
                      <tr key={row.id} className={rowClass}>
                        <td className="p-3">
                          <select
                            value={row.status}
                            onChange={(e) => handleStatusChangeStage1(row.id, e.target.value as Stage1Status)}
                            className={`border rounded px-2 py-1 text-xs cursor-pointer outline-none focus:ring-1 focus:ring-blue-500 w-full transition-colors
                                  ${row.status === Stage1Status.REPURCHASE ? 'bg-orange-50 text-orange-600 border-orange-200 font-medium' : ''}
                                  ${row.status === Stage1Status.DELETE ? 'bg-red-50 text-red-600 border-red-200 font-medium' : 'bg-white border-gray-300'}
                                `}
                          >
                            <option value={Stage1Status.DEVELOP}>開發</option>
                            <option value={Stage1Status.HALF_YEAR}>隔半年</option>
                            <option value={Stage1Status.REPURCHASE}>回購</option>
                            <option value={Stage1Status.DELETE}>刪除</option>
                          </select>
                        </td>
                        <td className={`p-3 ${textClass}`}>
                          <span className={`px-2 py-1 rounded text-xs ${isDeleted ? 'bg-gray-200 text-gray-500' : 'bg-gray-100 text-gray-600'}`}>
                            {row.category}
                          </span>
                        </td>
                        <td className={`p-3 ${textClass}`}>{row.date}</td>
                        <td className={`p-3 ${textClass}`}>{row.customerID}</td>
                        <td className={`p-3 ${textClass}`}>{row.itemID}</td>
                        <td className={`p-3 font-medium ${textClass}`}>{row.itemName}</td>
                        <td className={`p-3 text-right ${textClass}`}>{row.quantity}</td>
                        <td className={`p-3 text-right font-bold ${isDeleted ? 'text-gray-400 line-through decoration-red-500' : isRepurchase ? 'text-amber-600' : 'text-blue-600'}`}>
                          {isDeleted ? 0 : row.calculatedPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {activeTab === 'stage2' && (
              <div className="relative">
                <div className="sticky top-0 bg-white z-20 px-4 py-2 border-b border-green-100 text-sm text-gray-600 shadow-sm flex justify-between items-center">
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <Trash2 size={12} className="text-gray-300"/> 灰色刪除鍵為暫時刪除，不計入總額
                  </span>
                  <div className="flex items-center bg-green-50 px-3 py-1 rounded-lg border border-green-100">
                    <span className="font-semibold text-gray-600 mr-2">總獎勵:</span>
                    <span className="font-bold text-green-700 text-lg">
                       現金 {stage2Totals.cash.toLocaleString()} 元
                    </span>
                    <span className="mx-3 text-gray-300">|</span>
                    <span className="font-bold text-purple-700 text-lg">
                       禮券 {stage2Totals.vouchers} 張
                    </span>
                  </div>
                </div>
                <table className="w-full text-sm text-left whitespace-nowrap">
                  <thead className="bg-green-50 text-green-900 sticky top-12 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 font-semibold w-12 border-b border-green-100">刪除</th>
                      <th className="p-3 font-semibold border-b border-green-100">類別</th>
                      <th className="p-3 font-semibold border-b border-green-100">日期</th>
                      <th className="p-3 font-semibold border-b border-green-100">客戶編號</th>
                      <th className="p-3 font-semibold border-b border-green-100">品項編號</th>
                      <th className="p-3 font-semibold border-b border-green-100">品名</th>
                      <th className="p-3 font-semibold text-right border-b border-green-100">數量</th>
                      <th className="p-3 font-semibold border-b border-green-100">備註</th>
                      <th className="p-3 font-semibold text-right w-40 border-b border-green-100">獎勵</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {currentData.stage2.map(row => {
                      const textClass = row.isDeleted ? 'line-through decoration-red-500 decoration-2 text-gray-400' : 'text-gray-700';
                      
                      const isVoucher = row.format === '禮券';
                      const defaultCash = row.quantity * row.reward;
                      const currentCash = row.customReward !== undefined ? row.customReward : defaultCash;

                      return (
                        <tr key={row.id} className={`hover:bg-green-50 transition-colors ${row.isDeleted ? 'bg-red-50' : ''}`}>
                          <td className="p-2 text-center">
                            <button
                              onClick={() => handleToggleDeleteStage2(row.id)}
                              className={`p-1 rounded transition-colors ${row.isDeleted ? 'text-blue-500 hover:text-blue-700 bg-blue-50' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}
                              title={row.isDeleted ? "復原" : "刪除"}
                            >
                              {row.isDeleted ? <RotateCcw size={16} /> : <Trash2 size={16} />}
                            </button>
                          </td>
                          <td className={`p-3 ${textClass}`}>
                            <span className={`px-2 py-1 rounded text-xs ${row.isDeleted ? 'bg-gray-200 text-gray-500' : 'bg-green-100 text-green-800'}`}>
                              {row.category}
                            </span>
                          </td>
                          <td className={`p-3 ${textClass}`}>{row.displayDate}</td>
                          <td className={`p-3 ${textClass}`}>{row.customerID}</td>
                          <td className={`p-3 ${textClass}`}>{row.itemID}</td>
                          <td className={`p-3 font-medium ${textClass}`}>{row.itemName}</td>
                          <td className={`p-3 text-right ${textClass}`}>{row.quantity}</td>
                          <td className={`p-3 text-xs truncate max-w-[200px] ${textClass}`}>{row.note}</td>
                          
                          {/* Reward Column */}
                          <td className={`p-3 text-right font-bold ${textClass}`}>
                            {isVoucher ? (
                              <span className="text-purple-600 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                                {row.quantity}張 <span className="text-xs text-gray-500 font-normal">{row.rewardLabel}</span>
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-1">
                                <input 
                                  type="number" 
                                  disabled={row.isDeleted}
                                  value={currentCash}
                                  onChange={(e) => handleUpdateStage2CustomReward(row.id, e.target.value)}
                                  className={`w-20 text-right border-b border-gray-300 focus:border-green-500 focus:outline-none bg-transparent transition-colors ${row.customReward !== undefined ? 'text-green-600 font-bold border-green-300' : ''}`}
                                />
                                <span className="text-xs text-gray-500">元</span>
                              </div>
                            )}
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
                <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                  <thead className="bg-purple-50 text-purple-900 border-b border-purple-100">
                    <tr>
                      <th className="p-4 text-left font-semibold">品牌分類</th>
                      <th className="p-4 text-right font-semibold">金額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {currentData.stage3.rows.map(row => (
                      <tr key={row.categoryName} className="hover:bg-purple-50 transition-colors">
                        <td className="p-4 font-medium text-gray-700">{row.categoryName}</td>
                        <td className="p-4 text-right font-mono text-gray-800">${row.subTotal.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="bg-purple-50 font-bold border-t-2 border-purple-100">
                      <td className="p-4 text-purple-900">總金額</td>
                      <td className="p-4 text-right text-purple-700 text-lg">${currentData.stage3.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50">
          <div className="text-center p-8 bg-white rounded-lg shadow-sm border border-gray-100">
            <p className="text-lg font-medium text-gray-500 mb-2">暫無資料</p>
            <p className="text-sm">請確認已匯入所有必要的檔案，並選擇左側銷售人員。</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataViewer;
