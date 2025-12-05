import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface PopoutWindowProps {
  children: React.ReactNode;
  title: string;
  onClose: () => void;
}

const PopoutWindow: React.FC<PopoutWindowProps> = ({ children, title, onClose }) => {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const winRef = useRef<Window | null>(null);

  useEffect(() => {
    const openWindow = async () => {
      let win: Window | null = null;
      
      // 1. Try Document Picture-in-Picture API (Always on Top)
      // Note: This API is newer and primarily in Chrome/Edge.
      if ('documentPictureInPicture' in window) {
        try {
          // @ts-ignore - Types might not be fully available in current env
          win = await window.documentPictureInPicture.requestWindow({
            width: 1200,
            height: 800
          });
        } catch (err) {
          console.warn("PiP API failed, falling back to window.open", err);
        }
      }

      // 2. Fallback to standard window.open
      if (!win) {
        win = window.open('', '', 'width=1200,height=800,left=200,top=200');
      }

      if (!win) {
        alert("無法開啟視窗，請檢查是否被瀏覽器封鎖");
        onClose();
        return;
      }
      
      winRef.current = win;

      // Only write basic HTML if it's a standard window (PiP comes with empty document)
      if (!win.document.body) {
        win.document.open();
        win.document.write('<!DOCTYPE html><html><head><title>' + title + '</title></head><body></body></html>');
        win.document.close();
      }

      // 3. Inject Critical CSS & Resources
      // Use inline styles for layout to prevent "Glitch" before Tailwind loads
      const style = win.document.createElement('style');
      style.textContent = `
        html, body { 
          height: 100vh; 
          width: 100vw;
          margin: 0; 
          padding: 0; 
          overflow: hidden; 
          background-color: #f9fafb; 
          font-family: 'Noto Sans TC', sans-serif;
        }
        #popout-root { 
          height: 100%; 
          width: 100%;
          display: flex;
          flex-direction: column;
        }
        /* Explicitly style React root container to prevent collapse */
        #popout-root > div {
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        /* Scrollbars */
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #f1f1f1; }
        ::-webkit-scrollbar-thumb { background: #c1c1c1; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #a8a8a8; }
      `;
      win.document.head.appendChild(style);

      // Inject Tailwind CDN
      const script = win.document.createElement('script');
      script.src = "https://cdn.tailwindcss.com";
      win.document.head.appendChild(script);

      // Inject Fonts
      const link = win.document.createElement('link');
      link.href = "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@300;400;500;700&display=swap";
      link.rel = "stylesheet";
      win.document.head.appendChild(link);

      // 4. Create Root Element
      const div = win.document.createElement('div');
      div.id = 'popout-root';
      win.document.body.appendChild(div);
      
      setContainer(div);

      // 5. Cleanup Listeners
      const handleClose = () => {
         onClose();
      };
      
      // PiP windows fire 'pagehide' instead of beforeunload sometimes
      win.addEventListener('pagehide', handleClose);
      
      // Standard polling for window closure
      const checkClosed = setInterval(() => {
        if (win && win.closed) {
          clearInterval(checkClosed);
          handleClose();
        }
      }, 500);

      // Try to focus
      win.focus();
    };

    openWindow();

    return () => {
      if (winRef.current && !winRef.current.closed) {
        winRef.current.close();
      }
    };
  }, []);

  if (!container) return null;

  return createPortal(
    <div className="h-full flex flex-col bg-white">
       {children}
    </div>,
    container
  );
};

export default PopoutWindow;