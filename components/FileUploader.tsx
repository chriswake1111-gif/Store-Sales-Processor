import React, { useRef } from 'react';
import { Upload } from 'lucide-react';

interface FileUploaderProps {
  label: string;
  accept?: string;
  onFileSelect: (file: File) => void;
  disabled?: boolean;
  isLoaded?: boolean;
}

const FileUploader: React.FC<FileUploaderProps> = ({ label, accept = ".xlsx, .xls, .csv", onFileSelect, disabled, isLoaded }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!disabled && inputRef.current) {
      inputRef.current.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
    // Reset to allow same file selection
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="flex flex-col">
      <input
        type="file"
        ref={inputRef}
        accept={accept}
        onChange={handleChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={disabled}
        className={`
          flex items-center justify-center gap-2 px-4 py-3 rounded-lg shadow-sm font-medium transition-all
          ${disabled 
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
            : isLoaded
              ? 'bg-green-100 text-green-700 border border-green-300 hover:bg-green-200'
              : 'bg-white text-gray-700 border border-gray-300 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600'
          }
        `}
      >
        <Upload size={18} />
        <span>{label}</span>
        {isLoaded && <span className="ml-1 text-xs bg-green-200 px-2 py-0.5 rounded-full">已匯入</span>}
      </button>
    </div>
  );
};

export default FileUploader;