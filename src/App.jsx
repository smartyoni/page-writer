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
  Upload
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

const DEFAULT_NOTE_1 = "# 제목 1\n이곳은 세트 A의 노트입니다.\n\n## 시작하기\n내용을 수정해보세요.";
const DEFAULT_NOTE_2 = "# 제목 2\n이곳은 세트 B의 노트입니다.\n\n## 기능 안내\n목차 탭에서 헤더를 클릭하면 이동합니다.";

const getDocTitle = (content, legacyTitle) => {
  if (legacyTitle) return legacyTitle;
  if (!content) return "새 문서";
  const match = content.match(/^#\s+(.*)$/m);
  if (match && match[1].trim()) return match[1].trim();
  const firstLine = content.trim().split('\n')?.filter(l => l.trim())[0];
  return firstLine?.substring(0, 25) || "제목 없음";
};

const DOC_COLLECTION = 'users/default_user/documents';

export default function App() {
  const [documents, setDocuments] = useState([]);
  const [slots, setSlots] = useState(() => {
    const saved = localStorage.getItem('post_helper_slots');
    return saved ? JSON.parse(saved) : { A: '', B: '' };
  });

  const [activeSet, setActiveSet] = useState('A');
  const [activeTab, setActiveTab] = useState('note'); // 'list', 'toc', 'note', 'settings'
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [modalPosition, setModalPosition] = useState('bottom');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [draggedItemIndex, setDraggedItemIndex] = useState(null);

  const currentDocId = slots[activeSet];
  const currentDoc = documents.find(d => d.id === currentDocId) || documents[0];

  // Custom Heading extension to support IDs for TOC
  const CustomHeading = Heading.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        id: {
          default: null,
          renderHTML: attributes => ({
            id: attributes.id || attributes.textContent?.toLowerCase().replace(/\s+/g, '-'),
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
      Markdown,
      Placeholder.configure({
        placeholder: '이곳에 글을 작성하세요. 마크다운 문법(#, -, ** 등)이 실시간으로 적용됩니다...',
      }),
    ],
    content: currentDoc?.content || '',
    onUpdate: ({ editor }) => {
      const markdown = editor.storage.markdown.getMarkdown();
      if (currentDocId) {
        const docRef = doc(db, DOC_COLLECTION, currentDocId);
        setDoc(docRef, { 
          content: markdown, 
          modifiedAt: serverTimestamp(),
          updatedAt: Date.now()
        }, { merge: true });
      }
    },
    editorProps: {
      attributes: {
        class: 'prose prose-emerald max-w-none focus:outline-none min-h-[500px] text-sm text-slate-700 leading-relaxed custom-editor',
      },
    },
  }, [currentDocId]);

  useEffect(() => {
    if (editor && currentDoc && editor.storage.markdown.getMarkdown() !== currentDoc.content) {
      editor.commands.setContent(currentDoc.content, false, {
        parseOptions: { preserveWhitespace: 'full' }
      });
    }
  }, [currentDocId, editor, currentDoc?.content]);

  // Firestore Real-time Sync
  useEffect(() => {
    // We order by updatedAt (Nexus style) or modifiedAt
    // To ensure documents without 'order' are visible, we use updatedAt which is common
    const q = query(collection(db, DOC_COLLECTION), orderBy('updatedAt', 'desc'));
    
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
      
      // Initial Slot Setup if empty
      if (docs.length > 0) {
        setSlots(prev => {
          const next = { ...prev };
          if (!prev.A) next.A = docs[0].id;
          if (!prev.B) next.B = docs[0].id;
          return next;
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    localStorage.setItem('post_helper_slots', JSON.stringify(slots));
  }, [slots]);

  const handleNewDoc = async () => {
    const id = Date.now().toString();
    const newDoc = {
      content: "# 새 문서\n이곳에 내용을 입력하세요.",
      createdAt: Timestamp.now(),
      modifiedAt: Timestamp.now(),
      updatedAt: Date.now(),
      order: documents.length > 0 ? Math.min(...documents.map(d => d.order || 0)) - 1 : 0
    };
    await setDoc(doc(db, DOC_COLLECTION, id), newDoc);
    setSlots(prev => ({ ...prev, [activeSet]: id }));
    setActiveTab('note');
  };

  const handleSelectDoc = (id) => {
    setSlots(prev => ({ ...prev, [activeSet]: id }));
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
    setModalPosition(window.innerHeight - rect.bottom < 120 ? 'top' : 'bottom');
  };

  const confirmDelete = async (e) => {
    e.stopPropagation();
    const id = deleteConfirmId;
    if (documents.length <= 1) {
      alert("최소 한 개의 문서는 유지해야 합니다.");
      setDeleteConfirmId(null);
      return;
    }
    await deleteDoc(doc(db, DOC_COLLECTION, id));
    setDeleteConfirmId(null);
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
    const headers = [];
    const counters = [0, 0, 0]; // Counters for H1, H2, H3
    
    lines.forEach((line) => {
      const match = line.match(/^(#{1,3})\s+(.*)$/);
      if (match) {
        const level = match[1].length;
        
        // Update counters
        counters[level - 1]++;
        // Reset lower level counters
        for (let i = level; i < 3; i++) counters[i] = 0;
        
        // Generate number string (e.g., 1., 1.1., 1.1.1.)
        const number = counters.slice(0, level).join('.') + '.';
        
        headers.push({
          level,
          text: match[2],
          number,
          id: match[2].toLowerCase().replace(/\s+/g, '-')
        });
      }
    });
    return headers;
  };

  const toc = extractTOC(currentDoc?.content || '');

  const scrollToHeader = (id) => {
    setActiveTab('note');
    setTimeout(() => {
      // Try finding by ID first
      let element = document.getElementById(id);
      
      // Fallback: Find the header by text matching the TOC logic
      if (!element) {
        const headers = document.querySelectorAll('.ProseMirror h1, .ProseMirror h2, .ProseMirror h3');
        element = Array.from(headers).find(h => 
          h.textContent.trim().toLowerCase().replace(/\s+/g, '-') === id
        );
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
      <div className="flex items-center justify-between border-b border-emerald-900/10 bg-emerald-50/80 backdrop-blur-md px-2 z-10">
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
          <button
            onClick={() => setActiveTab('settings')}
            className={cn(
              "flex items-center gap-2 px-5 py-3 border-b-2 transition-all",
              activeTab === 'settings' ? "border-primary text-primary" : "border-transparent text-slate-500 hover:text-emerald-700"
            )}
          >
            <Settings size={18} />
            <span className="font-bold text-sm capitalize">설정</span>
          </button>
        </div>
        <div className="flex items-center p-1.5 gap-1 bg-emerald-900/5 rounded-xl mr-2">
          {['A', 'B'].map(set => (
            <button 
              key={set}
              onClick={() => setActiveSet(set)}
              className={cn(
                "px-3 py-1 rounded-lg text-xs font-bold transition-all",
                activeSet === set ? "bg-primary text-white shadow-md" : "text-emerald-800/60"
              )}
            >
              SET {set}
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
                    "group flex items-center justify-between py-2.5 px-3 cursor-grab active:cursor-grabbing border-b border-emerald-900/5 transition-all duration-200",
                    slots[activeSet] === doc.id ? "bg-emerald-100/50" : "hover:bg-emerald-100/30",
                    draggedItemIndex === idx && "opacity-40 bg-emerald-200 border-2 border-dashed border-emerald-400"
                  )}
                >
                  <div className="flex items-center gap-4 flex-1 min-w-0">
                    <span className="shrink-0 font-black text-[15px] text-rose-500/80 w-5 font-serif italic" style={{ fontFamily: "'Noto Serif KR', serif" }}>
                      {idx + 1}
                    </span>
                    <h3 className="font-bold text-[14px] truncate text-slate-700 group-hover:text-emerald-700 transition-colors" style={{ fontFamily: "'Noto Serif KR', serif" }}>
                      {getDocTitle(doc.content, doc.title)}
                    </h3>
                  </div>
                  <button onClick={(e) => handleDeleteDoc(doc.id, e)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-rose-500 transition-all p-1">
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : activeTab === 'toc' ? (
            <div className="py-4 space-y-1">
              {toc.map((item, idx) => (
                <button 
                  key={idx} 
                  onClick={() => scrollToHeader(item.id)} 
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-all hover:bg-white shadow-sm hover:shadow-md border border-transparent hover:border-emerald-100",
                    item.level === 1 ? "text-[#f97316] font-black text-base" : 
                    item.level === 2 ? "text-[#2563eb] font-extrabold text-sm ml-4" : 
                    "text-slate-600 font-bold text-xs ml-8"
                  )}
                >
                  <span className="flex items-center gap-3">
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
                </button>
              ))}
            </div>
          ) : activeTab === 'settings' ? (
            <div className="flex-1 flex flex-col p-6 space-y-8 overflow-y-auto bg-gray-50/50 rounded-2xl mt-4">
              <section className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Cloud size={20} className="text-emerald-600" />
                  클라우드 데이터 마이그레이션
                </h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  현재 브라우저에 임시 저장된 글들을 서버로 안전하게 옮깁니다. 
                  <br /><strong>모바일과 동기화하기 위해 반드시 한 번 실행해야 합니다.</strong>
                </p>
                <button
                  onClick={handleCloudSync}
                  className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2"
                >
                  <Upload size={18} />
                  기존 데이터를 서버로 업로드
                </button>
              </section>

              <section className="space-y-4 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <Smartphone size={20} className="text-emerald-600" />
                  기기 간 동기화 (싱크 키)
                </h3>
                <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm space-y-3">
                  <p className="text-sm text-gray-600">
                    현재 모든 기기가 동일한 공간을 공유하고 있습니다. 별도의 설정 없이 바로 동기화됩니다.
                  </p>
                </div>
              </section>
            </div>
          ) : (
            <div className="h-full group relative">
              <div className="editor-container">
                <EditorContent editor={editor} />
              </div>
              <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 opacity-0 group-hover:opacity-100 flex flex-col items-center">
                {showClearConfirm && (
                  <div className="mb-3 bg-white/90 backdrop-blur-xl border border-emerald-900/10 p-4 rounded-2xl shadow-2xl z-50 min-w-[180px]">
                    <p className="text-[11px] font-bold text-center text-emerald-900 mb-4">정말 초기화하시겠습니까?</p>
                    <div className="flex gap-2">
                      <button onClick={() => setShowClearConfirm(false)} className="flex-1 py-1.5 rounded-lg text-xs font-bold text-slate-500 bg-slate-100">취소</button>
                      <button onClick={handleClearNote} className="flex-1 py-1.5 rounded-lg text-xs font-bold bg-rose-500 text-white">확인</button>
                    </div>
                  </div>
                )}
                <div className="flex gap-1 bg-emerald-900/5 p-1 rounded-xl">
                  <button onClick={handleNewDoc} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-emerald-700 hover:bg-white/50"><PlusCircle size={14} /> 새 문서</button>
                  <button onClick={handleCopy} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-emerald-800 hover:bg-white/50"><Copy size={14} /> 복사</button>
                  <button onClick={() => setShowClearConfirm(true)} className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold text-rose-500 hover:bg-white/50"><Trash2 size={14} /> 초기화</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
