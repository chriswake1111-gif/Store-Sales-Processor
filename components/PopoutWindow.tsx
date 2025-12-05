
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoutWindowProps {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}

const PopoutWindow: React.FC<PopoutWindowProps> = ({ children, title, onClose }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const newWindow = useRef<Window | null>(null);

  useEffect(() => {
    // Open a new window
    const win = window.open('', '', 'width=1200,height=800,left=200,top=200');
    if (!win) {
      alert("無法開啟視窗，請檢查是否被瀏覽器封鎖");
      onClose();
      return;
    }
    
    newWindow.current = win;
    
    // Ensure the document is clean and ready
    win.document.open();
    win.document.write('<!DOCTYPE html><html><head><title>' + title + '</title></head><body></body></html>');
    win.document.close();

    // Create container
    const div = win.document.createElement('div');
    div.id = 'popout-root';
    win.document.body.appendChild(div);

    // Inject styles for full height layout
    // CRITICAL FIX: Add explicit CSS for layout structure so it doesn't depend on Tailwind loading speed
    const style = win.document.createElement('style');
    style.textContent = `
      html, body { 
        height: 100vh; 
        width: 100vw;
        margin: 0; 
        padding: 0; 
        overflow: hidden; 
        background-color: #f9fafb; 
      }
      #popout-root { 
        height: 100%; 
        width: 100%;
        display: flex;
        flex-direction: column;
      }
      /* Ensure the direct child (React App wrapper) also takes full height */
      #popout-root > div {
        height: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      body { font-family: 'Noto Sans TC', sans-serif; }
      
      /* Custom scrollbar */
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: #f1f1f1; }
      ::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
      ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
    `;
    win.document.head.appendChild(style);

    // Inject Tailwind
    const script = win.document.createElement('script');
    script.src = "https://cdn.tailwindcss.com";
    win.document.head.appendChild(script);

    // Copy Fonts
    const link = win.document.createElement('link');
    link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap";
    link.rel = "stylesheet";
    win.document.head.appendChild(link);

    setContainer(div);

    // Handle close via interval check (more reliable than onbeforeunload for popup)
    const checkClosed = setInterval(() => {
      if (win.closed) {
        clearInterval(checkClosed);
        onClose();
      }
    }, 500);

    // Also bind unload just in case
    win.onbeforeunload = () => {
      onClose();
    };

    return () => {
      clearInterval(checkClosed);
      if (newWindow.current && !newWindow.current.closed) {
        newWindow.current.close();
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(
    <div className="h-full flex flex-col">
       {children}
    </div>,
    container
  );
};

export default PopoutWindow;
