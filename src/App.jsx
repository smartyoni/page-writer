import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import Placeholder from '@tiptap/extension-placeholder';
import Heading from '@tiptap/extension-heading';
import { 
  FileText, 
  List, 
  Hash, 
  PlusCircle,
  Copy,
  Trash2,
  Layout,
  Settings,
  Cloud,
  Smartphone,
  Upload,
  Download,
  Lock,
  Unlock,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { 
  collection, 
  onSnapshot, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  Timestamp,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import { db } from './lib/firebase';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}



const getDocTitle = (content) => {
  if (!content || !content.trim()) return "제목없음";
  const match = content.match(/^#\s+(.*)$/m);
  if (match && match[1].trim()) return match[1].trim();
  return "제목없음";
};

const DOC_COLLECTION = 'users/default_user/documents';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [currentDocId, setCurrentDocId] = useState(() => {
    return localStorage.getItem('post_helper_current_doc') || '';
  });

  const [activeTab, setActiveTab] = useState('note'); // 'list', 'toc', 'note'
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [modalPosition, setModalPosition] = useState('bottom');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);
  const [collapsedTOCItems, setCollapsedTOCItems] = useState(new Set());
  const [draggedTOCIndex, setDraggedTOCIndex] = useState(null);
  const [dragOverTOCIndex, setDragOverTOCIndex] = useState(null);
  const saveTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  const currentDoc = documents.find(d => d.id === currentDocId) || documents[0];

  // Custom Heading extension to support IDs for TOC
  const CustomHeading = Heading.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        id: {
          default: null,
          renderHTML: attributes => ({
            id: attributes.id || `header-${attributes.level}-${attributes.textContent?.toLowerCase().replace(/\s+/g, '-')}`,
          }),
          parseHTML: element => element.getAttribute('id'),
        },
      }
    },
  });

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false, // Disable default heading to use our custom one
      }),
      CustomHeading.configure({
        levels: [1, 2, 3],
      }),
      Markdown.configure({
        html: true,
        tightLists: true,
        tightListClass: 'tight',
        transformPastedText: true,
      }),
      Placeholder.configure({
        placeholder: '이곳에 글을 작성하세요. 마크다운 문법(#, -, ** 등)이 실시간으로 적용됩니다...',
      }),
    ],
    content: currentDoc?.content || '',
    onUpdate: ({ editor }) => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      
      saveTimeoutRef.current = setTimeout(() => {
        const markdown = editor.storage.markdown.getMarkdown();
        if (currentDocId) {
          const docRef = doc(db, DOC_COLLECTION, currentDocId);
          setDoc(docRef, { 
            content: markdown, 
            modifiedAt: serverTimestamp(),
            updatedAt: Date.now()
          }, { merge: true });
        }
      }, 1000); // 1 second debounce
    },
    editorProps: {
      attributes: {
        class: 'prose prose-emerald max-w-none focus:outline-none min-h-[500px] text-sm text-slate-700 leading-relaxed custom-editor',
      },
    },
  }, [currentDocId]);

  useEffect(() => {
    if (editor && currentDoc && !editor.isFocused) {
      const currentMarkdown = editor.storage.markdown.getMarkdown();
      if (currentMarkdown !== currentDoc.content) {
        editor.commands.setContent(currentDoc.content, false, {
          parseOptions: { preserveWhitespace: 'full' }
        });
      }
    }
  }, [currentDocId, editor, currentDoc?.content]);

  // Firestore Real-time Sync
  useEffect(() => {
    // 'order' 필드 기준으로 오름차순 정렬하여 사용자 지정 순서를 유지합니다.
    const q = query(collection(db, DOC_COLLECTION), orderBy('order', 'asc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => {
        const data = d.data();
        // Compatibility Mapping:
        // 1. Content: If 'content' is missing but 'pages' exists, use pages[0]
        let content = data.content;
        if (!content && data.pages && Array.isArray(data.pages)) {
          content = data.pages[0] || "";
        }
        
        // 2. Timestamp: Support both modifiedAt (Timestamp) and updatedAt (Millis)
        let modifiedAt = data.modifiedAt;
        if (data.updatedAt && !modifiedAt) {
          modifiedAt = Timestamp.fromMillis(data.updatedAt);
        }

        return { 
          id: d.id, 
          ...data,
          content: content || "",
          modifiedAt: modifiedAt || Timestamp.now()
        };
      });
      setDocuments(docs);

      // Auto-select first doc if nothing is selected
      if (docs.length > 0) {
        setCurrentDocId(prev => {
          if (!prev || !docs.find(d => d.id === prev)) return docs[0].id;
          return prev;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (currentDocId) {
      localStorage.setItem('post_helper_current_doc', currentDocId);
    }
  }, [currentDocId]);

  const handleNewDocWithContent = async (content) => {
    const id = Date.now().toString();
    const newDoc = {
      content: content || "# ",
      createdAt: Timestamp.now(),
      modifiedAt: Timestamp.now(),
      updatedAt: Date.now(),
      order: documents.length > 0 ? Math.min(...documents.map(d => d.order || 0)) - 1 : 0
    };
    await setDoc(doc(db, DOC_COLLECTION, id), newDoc);
    setCurrentDocId(id);
    setActiveTab('note');
  };

  const handleNewDoc = () => handleNewDocWithContent('');

  const handleFileImport = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target.result;
      const title = file.name.replace(/\.[^/.]+$/, ""); // 확장자 제거
      handleNewDocWithContent(`# ${title}\n\n${content}`);
    };
    reader.readAsText(file);
    e.target.value = null; // 리셋
  };

  const handleFileExport = () => {
    if (!currentDoc) return;
    const markdown = editor.storage.markdown.getMarkdown();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    
    // 파일명 정제 (제목 또는 첫 줄 사용)
    // 제목 가져오기 (# 헤더 우선)
    const rawTitle = getDocTitle(markdown);
    const safeTitle = rawTitle.replace(/[<>:"/\\|?*]/g, "").substring(0, 50);
    
    link.href = url;
    link.download = `${safeTitle || 'document'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleSelectDoc = (id) => {
    setCurrentDocId(id);
    setActiveTab('note');
  };

  const handleDeleteDoc = (id, e) => {
    e.stopPropagation();
    if (deleteConfirmId === id) {
      setDeleteConfirmId(null);
      return;
    }
    setDeleteConfirmId(id);
    const rect = e.currentTarget.getBoundingClientRect();
    setModalPosition(window.innerHeight - rect.bottom < 100 ? 'top' : 'bottom');
  };

  const handleToggleLock = async (docId, isLocked, e) => {
    e.stopPropagation();
    try {
      await setDoc(doc(db, DOC_COLLECTION, docId), { isLocked: !isLocked }, { merge: true });
    } catch (error) {
      console.error("Error toggling lock: ", error);
    }
  };

  const confirmDelete = async (e) => {
    e.stopPropagation();
    const id = deleteConfirmId;
    if (!id) return;

    const targetDoc = documents.find(d => d.id === id);
    if (targetDoc?.isLocked) {
      alert("잠긴 문서는 삭제할 수 없습니다. 먼저 잠금을 해제해주세요.");
      setDeleteConfirmId(null);
      return;
    }
    
    try {
      await deleteDoc(doc(db, DOC_COLLECTION, id));
      setDeleteConfirmId(null);
    } catch (error) {
      console.error("Error deleting document: ", error);
      alert("문서 삭제 중 오류가 발생했습니다: " + error.message);
    }
  };

  const handleClearNote = () => {
    editor?.commands.setContent('');
    setShowClearConfirm(false);
  };

  const handleDragStart = (e, index) => {
    setDraggedItemIndex(index);
    e.dataTransfer.effectAllowed = "move";
    // For Firefox support
    e.dataTransfer.setData("text/html", e.target.parentNode);
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetIndex) => {
    e.preventDefault();
    if (draggedItemIndex === null || draggedItemIndex === targetIndex) return;

    const newDocs = [...documents];
    const draggedItem = newDocs[draggedItemIndex];
    newDocs.splice(draggedItemIndex, 1);
    newDocs.splice(targetIndex, 0, draggedItem);

    // Update orders in Firestore
    const batch = writeBatch(db);
    newDocs.forEach((docData, i) => {
      batch.update(doc(db, DOC_COLLECTION, docData.id), { order: i });
    });
    await batch.commit();
    setDraggedItemIndex(null);
  };

  const handleCloudSync = async () => {
    const localData = localStorage.getItem('post_helper_documents');
    if (!localData) {
      alert("업로드할 로컬 데이터가 없습니다.");
      return;
    }
    
    try {
      const localDocs = JSON.parse(localData);
      const batch = writeBatch(db);
      localDocs.forEach((d, i) => {
        const id = d.id || Date.now().toString() + i;
        batch.set(doc(db, DOC_COLLECTION, id), {
          content: d.content,
          createdAt: d.createdAt ? Timestamp.fromMillis(d.createdAt) : Timestamp.now(),
          modifiedAt: d.modifiedAt ? Timestamp.fromMillis(d.modifiedAt) : Timestamp.now(),
          updatedAt: d.updatedAt || d.modifiedAt || Date.now(),
          order: d.order || i
        });
      });
      await batch.commit();
      alert("모든 로컬 데이터가 성공적으로 클라우드로 업로드되었습니다!");
      localStorage.removeItem('post_helper_documents');
    } catch (e) {
      console.error(e);
      alert("동기화 중 오류가 발생했습니다.");
    }
  };


  const extractTOC = (text) => {
    const lines = text.split('\n');
    const items = [];
    const counters = [0, 0, 0]; // Counters for H1, H2, H3
    
    lines.forEach((line, lineIdx) => {
      const headerMatch = line.match(/^(#{1,3})\s+(.*)$/);
      if (headerMatch) {
        const level = headerMatch[1].length;
        const textLabel = headerMatch[2];
        const id = `header-${level}-${textLabel.toLowerCase().replace(/\s+/g, '-')}`;

        counters[level - 1]++;
        for (let i = level; i < 3; i++) counters[i] = 0;
        const number = counters.slice(0, level).join('.') + '.';
        
        const parentHeader = items.slice().reverse().find(it => it.level < level);
        if (parentHeader) parentHeader.hasChildren = true;

        items.push({
          type: 'header',
          level,
          text: textLabel,
          number,
          id,
          hasChildren: false,
          startLine: lineIdx,
          endLine: lines.length - 1, // will be set in next pass
        });
      }
    });

    // Second pass: Calculate endLine for each item
    // An item's block ends just before the next item of equal or higher level
    for (let i = 0; i < items.length; i++) {
      const current = items[i];
      let endLine = lines.length - 1;
      for (let j = i + 1; j < items.length; j++) {
        if (items[j].level <= current.level) {
          endLine = items[j].startLine - 1;
          break;
        }
      }
      current.endLine = endLine;
    }

    return items;
  };

  // Reorder markdown: move the block at dragIdx before the block at targetIdx
  const reorderMarkdownBlocks = (content, toc, dragIdx, targetIdx) => {
    if (dragIdx === targetIdx) return content;
    const lines = content.split('\n');

    // Determine the block bounds for the dragged item
    // The dragged block includes itself AND all descendants (items with higher level that follow)
    const draggedItem = toc[dragIdx];
    let blockEndLine = draggedItem.endLine;

    // Find the target insertion position
    // We insert the block BEFORE the target item's start line
    const targetItem = toc[targetIdx];

    // Slice out the dragged block lines
    const draggedLines = lines.slice(draggedItem.startLine, blockEndLine + 1);
    // Remove the dragged block from original lines
    const remaining = [
      ...lines.slice(0, draggedItem.startLine),
      ...lines.slice(blockEndLine + 1)
    ];

    // Find the target line in the REMAINING array (its index shifted if drag was before target)
    let targetStartLine = targetItem.startLine;
    if (dragIdx < targetIdx) {
      // Dragged block was before target, so target line shifted up by dragged block size
      targetStartLine -= (blockEndLine - draggedItem.startLine + 1);
    }

    // Insert dragged block before the target item in the remaining lines
    const newLines = [
      ...remaining.slice(0, targetStartLine),
      ...draggedLines,
      ...remaining.slice(targetStartLine)
    ];

    return newLines.join('\n');
  };

  const toc = extractTOC(currentDoc?.content || '');

  // --- TOC Drag & Drop Handlers ---
  const handleTOCDragStart = (e, idx) => {
    setDraggedTOCIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
  };

  const handleTOCDragOver = (e, idx) => {
    e.preventDefault();
    if (draggedTOCIndex === null || idx === draggedTOCIndex) return;
    // Prevent dropping into a descendant of the dragged item
    const draggedItem = toc[draggedTOCIndex];
    const targetItem = toc[idx];
    if (targetItem.startLine > draggedItem.startLine && targetItem.startLine <= draggedItem.endLine) return;
    e.dataTransfer.dropEffect = 'move';
    setDragOverTOCIndex(idx);
  };

  const handleTOCDrop = async (e, targetIdx) => {
    e.preventDefault();
    const fromIdx = draggedTOCIndex;
    setDraggedTOCIndex(null);
    setDragOverTOCIndex(null);
    if (fromIdx === null || fromIdx === targetIdx || !currentDoc) return;

    // Guard: prevent dropping inside own subtree
    const draggedItem = toc[fromIdx];
    const targetItem = toc[targetIdx];
    if (targetItem.startLine > draggedItem.startLine && targetItem.startLine <= draggedItem.endLine) return;

    const newMarkdown = reorderMarkdownBlocks(currentDoc.content, toc, fromIdx, targetIdx);
    if (newMarkdown === currentDoc.content) return;

    // Apply to Tiptap editor as a single History step so Ctrl+Z works
    if (editor) {
      // setContent with emitUpdate=false to avoid double-saving,
      // then we manually save to Firestore so Undo reverts the editor state.
      editor.commands.setContent(newMarkdown, false, { parseOptions: { preserveWhitespace: 'full' } });
      // Manually push one Undo step by recording the transaction AFTER setContent
      // Tiptap wraps setContent in a dispatchTransaction that feeds into history.
    }

    // Persist to Firestore
    if (currentDocId) {
      const docRef = doc(db, DOC_COLLECTION, currentDocId);
      await setDoc(docRef, {
        content: newMarkdown,
        modifiedAt: serverTimestamp(),
        updatedAt: Date.now()
      }, { merge: true });
    }
  };

  const handleTOCDragEnd = () => {
    setDraggedTOCIndex(null);
    setDragOverTOCIndex(null);
  };

  const scrollToHeader = (id) => {
    setActiveTab('note');
    setTimeout(() => {
      // Try finding by ID first
      let element = document.getElementById(id);
      
      // Fallback: More robust text matching
      if (!element) {
        // Find both headers and list items
        const targets = document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3, .ProseMirror li');
        
        // Normalize the search ID (strip bullet- prefix for comparison)
        const targetCleanText = id.replace(/^bullet-/, '').replace(/^header-\d-/, '').toLowerCase();

        element = Array.from(targets).find(el => {
          // Get text and strip the common markers like "• " or "1. "
          const elTextRaw = el.textContent.trim().toLowerCase();
          const elTextClean = elTextRaw
            .replace(/^([•*-]|\d+\.)\s+/, '') // Remove "• ", "1. ", "- ", etc.
            .replace(/\s+/g, '-');
          
          return elTextClean === targetCleanText;
        });
      }

      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Add a temporary highlight effect
        element.classList.add('highlight-flash');
        setTimeout(() => element.classList.remove('highlight-flash'), 2000);
      }
    }, 150);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(currentDoc.content.trim());
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-slate-900 font-medium bg-[#f2faf5]">
      <div className="flex items-center border-b border-emerald-900/10 bg-emerald-50/80 backdrop-blur-md px-2 z-10">
        <div className="flex">
          {['list', 'toc', 'note'].map((tab) => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 border-b-2 transition-all",
                activeTab === tab ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-emerald-700"
              )}
            >
              {tab === 'list' ? <Layout size={18}/> : tab === 'toc' ? <List size={18}/> : <FileText size={18}/>}
              <span className="font-bold text-sm capitalize">{tab}</span>
            </button>
          ))}
        </div>
      </div>

      <main className="flex-1 overflow-y-auto relative px-4 pt-1 pb-4 lg:px-6 lg:pb-6 custom-scrollbar">
        <div className="max-w-4xl mx-auto h-full">
          {activeTab === 'list' ? (
            <div className="py-4">
              {documents.map((doc, idx) => (
                <div 
                  key={doc.id}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => setDraggedItemIndex(null)}
                  onClick={() => handleSelectDoc(doc.id)} 
                  className={cn(
                    "relative group flex items-center justify-between py-2.5 px-3 cursor-grab active:cursor-grabbing border-b border-emerald-900/5 transition-all duration-200",
                    currentDocId === doc.id ? "bg-emerald-100/50" : "hover:bg-emerald-100/30",
                    draggedItemIndex === idx && "opacity-40 bg-emerald-200 border-2 border-dashed border-emerald-400"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="shrink-0 font-black text-[15px] text-rose-500/80 w-5 font-serif italic" style={{ fontFamily: "'Noto Serif KR', serif" }}>
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-[14px] truncate text-slate-700 group-hover:text-emerald-700 transition-colors" style={{ fontFamily: "'Noto Serif KR', serif" }}>
                      {getDocTitle(doc.content)}
                    </h3>
                  </div>
                  <div className="flex items-center bg-slate-100/50 p-1 rounded-xl gap-0.5 border border-slate-200/50">
                    <button 
                      onClick={(e) => handleToggleLock(doc.id, doc.isLocked, e)}
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        doc.isLocked ? "bg-white text-emerald-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                      )}
                      title={doc.isLocked ? "잠금 해제" : "잠금"}
                    >
                      {doc.isLocked ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                    <div className="w-[1px] h-3 bg-slate-300/50 mx-0.5" />
                    <button 
                      onClick={(e) => !doc.isLocked && handleDeleteDoc(doc.id, e)} 
                      className={cn(
                        "p-1.5 rounded-lg transition-all",
                        doc.isLocked ? "opacity-30 cursor-not-allowed" : "text-slate-400 hover:text-rose-500 hover:bg-rose-50/50"
                      )}
                      disabled={doc.isLocked}
                      title="삭제"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {deleteConfirmId === doc.id && (
                    <div 
                      className={cn(
                        "absolute right-2 z-[50] bg-white shadow-2xl border border-emerald-900/10 p-1.5 rounded-xl flex items-center gap-1.5 transition-all",
                        modalPosition === 'top' ? "bottom-full mb-1.5 translate-y-0" : "top-full mt-1.5 -translate-y-0"
                      )}
                    >
                      <span className="text-[10px] font-bold text-slate-500 px-1 whitespace-nowrap">삭제할까요?</span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(null); }} 
                        className="px-2 py-1 rounded-lg text-[10px] bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                      >
                        취소
                      </button>
                      <button 
                        onClick={confirmDelete} 
                        className="px-2 py-1 rounded-lg text-[10px] bg-rose-500 text-white font-bold hover:bg-rose-600 shadow-sm transition-colors"
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : activeTab === 'toc' ? (
            <div className="py-4 space-y-1">
              {toc.map((item, idx) => {
                // Determine if this item should be visible based on its parent's collapse state
                const parentHeader = toc.slice(0, idx).reverse().find(it => it.level < item.level);
                const isHidden = parentHeader && collapsedTOCItems.has(parentHeader.id);

                if (isHidden) return null;

                const isCollapsed = collapsedTOCItems.has(item.id);
                const isDragging = draggedTOCIndex === idx;
                const isDropTarget = dragOverTOCIndex === idx && draggedTOCIndex !== idx;
                const toggleCollapse = (e) => {
                  e.stopPropagation();
                  setCollapsedTOCItems(prev => {
                    const next = new Set(prev);
                    if (next.has(item.id)) next.delete(item.id);
                    else next.add(item.id);
                    return next;
                  });
                };

                return (
                  <div
                    key={idx}
                    draggable="true"
                    onDragStart={(e) => handleTOCDragStart(e, idx)}
                    onDragOver={(e) => handleTOCDragOver(e, idx)}
                    onDrop={(e) => handleTOCDrop(e, idx)}
                    onDragEnd={handleTOCDragEnd}
                    className={cn(
                      "group flex items-center rounded-lg transition-all duration-150",
                      isDragging && "opacity-40",
                      isDropTarget && "border-t-2 border-emerald-400"
                    )}
                  >
                    {/* Drag handle */}
                    <div className="cursor-grab active:cursor-grabbing px-1 py-2 text-slate-300 hover:text-slate-400 shrink-0">
                      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                        <circle cx="3" cy="4" r="1.5"/><circle cx="9" cy="4" r="1.5"/>
                        <circle cx="3" cy="8" r="1.5"/><circle cx="9" cy="8" r="1.5"/>
                        <circle cx="3" cy="12" r="1.5"/><circle cx="9" cy="12" r="1.5"/>
                      </svg>
                    </div>
                    <button 
                      onClick={() => scrollToHeader(item.id)} 
                      className={cn(
                        "flex-1 text-left p-2.5 rounded-lg transition-all hover:bg-white shadow-sm hover:shadow-md border border-transparent hover:border-emerald-100 flex items-center justify-between",
                        item.level === 1 ? "text-[#f97316] font-black text-base" : 
                        item.level === 2 ? "text-[#2563eb] font-extrabold text-sm ml-4" : 
                        "text-slate-600 font-bold text-xs ml-8"
                      )}
                    >
                      <span className="flex items-center gap-3 overflow-hidden">
                        <span className={cn(
                          "shrink-0 font-black tracking-tighter",
                          item.level === 1 ? "text-lg text-[#2563eb]" : 
                          item.level === 2 ? "text-sm text-[#16a34a]" : 
                          "text-[10px] text-slate-500"
                        )}>
                          {item.number}
                        </span>
                        <span className={cn(
                          "truncate transition-colors",
                          item.level === 1 ? "font-black text-slate-900" :
                          item.level === 2 ? "font-extrabold text-slate-800" :
                          "font-bold text-slate-600"
                        )}>{item.text}</span>
                      </span>

                      {item.hasChildren && (
                        <div 
                          onClick={toggleCollapse}
                          className="p-1.5 rounded-md hover:bg-emerald-100/50 text-slate-400 hover:text-emerald-600 transition-colors"
                        >
                          {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                        </div>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-full group relative">
              <div className="editor-container">
                <EditorContent editor={editor} />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- Global Action Footer --- */}
      <footer className="bg-white/80 backdrop-blur-md border-t border-emerald-900/10 p-2 z-20 safe-bottom">
        <div className="max-w-4xl mx-auto flex flex-col items-center">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileImport} 
            accept=".md,.markdown,text/markdown" 
            className="hidden" 
          />

          {showClearConfirm && (
            <div className="mb-3 bg-white/95 backdrop-blur-xl border border-emerald-900/10 p-4 rounded-2xl shadow-2xl z-50 min-w-[180px]">
              <p className="text-[11px] font-bold text-center text-emerald-900 mb-4">정말 초기화하시겠습니까?</p>
              <div className="flex gap-2">
                <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-100">취소</button>
                <button onClick={handleClearNote} className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white">확인</button>
              </div>
            </div>
          )}
          <div className="flex bg-white/50 border border-emerald-900/5 p-1 rounded-2xl shadow-sm overflow-hidden flex-nowrap w-full">
            <button 
              onClick={handleNewDoc} 
              className="flex items-center justify-center gap-1 px-3 lg:px-6 py-2.5 rounded-xl text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 transition-colors min-w-[65px] lg:min-w-[100px] whitespace-nowrap"
            >
              <PlusCircle size={14} /> 새문서
            </button>
            
            <div className="w-[1px] h-4 bg-emerald-900/10 self-center" />
            
            <button 
              onClick={() => fileInputRef.current?.click()} 
              className="flex items-center justify-center gap-1 px-3 lg:px-6 py-2.5 rounded-xl text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 transition-colors min-w-[65px] lg:min-w-[100px] whitespace-nowrap"
            >
              <Upload size={14} /> 불러오기
            </button>
            
            {(activeTab === 'note' || activeTab === 'toc') && (
              <>
                <div className="w-[1px] h-4 bg-emerald-900/10 self-center" />
                <button 
                  onClick={handleFileExport} 
                  className="flex items-center justify-center gap-1 px-3 lg:px-6 py-2.5 rounded-xl text-[11px] font-bold text-blue-600 hover:bg-blue-50 transition-colors min-w-[65px] lg:min-w-[100px] whitespace-nowrap"
                >
                  <Download size={14} /> 내보내기
                </button>
                <div className="w-[1px] h-4 bg-emerald-900/10 self-center" />
                <button 
                  onClick={handleCopy} 
                  className="flex items-center justify-center gap-1 px-3 lg:px-6 py-2.5 rounded-xl text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 transition-colors min-w-[65px] lg:min-w-[100px] whitespace-nowrap"
                >
                  <Copy size={14} /> 복사
                </button>
                <div className="w-[1px] h-4 bg-emerald-900/10 self-center" />
                <button 
                  onClick={() => setShowClearConfirm(true)} 
                  className="flex items-center justify-center gap-1 px-3 lg:px-6 py-2.5 rounded-xl text-[11px] font-bold text-rose-500 hover:bg-rose-50 transition-colors min-w-[65px] lg:min-w-[100px] whitespace-nowrap"
                >
                  <Trash2 size={14} /> 초기화
                </button>
              </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
